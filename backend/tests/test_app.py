"""Unit tests for the Lambda API. AWS clients are replaced with in-memory fakes; nothing touches AWS.

Run from the repository root:
    python -m unittest discover -s backend/tests -v
"""

import contextlib
import copy
import csv
import io
import json
import os
import sys
import time
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

from botocore.exceptions import ClientError

ENV = {
    "REPORTS_TABLE": "reports",
    "SHARES_TABLE": "shares",
    "USAGE_TABLE": "usage",
    "ACCESS_REQUESTS_TABLE": "access-requests",
    "PHOTO_BUCKET": "photo-bucket",
    "GEMINI_PARAM_NAME": "/test/gemini",
    "NREL_PARAM_NAME": "/test/nrel",
    "ALLOWED_ORIGINS": "https://app.example",
    "AWS_DEFAULT_REGION": "us-east-1",
}

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambda"))
with mock.patch.dict(os.environ, ENV), mock.patch("boto3.resource"), mock.patch("boto3.client"):
    import app

HEX = "0123456789abcdef0123456789abcdef"
ACME_KEY = f"companies/acme/uploads/{HEX}/roof.jpg"
OTHER_KEY = f"companies/other/uploads/{HEX}/roof.jpg"


def conditional_failure():
    return ClientError({"Error": {"Code": "ConditionalCheckFailedException", "Message": "x"}}, "PutItem")


class FakeReportsTable:
    def __init__(self):
        self.items = {}
        self.query_calls = 0

    def get_item(self, Key):
        item = self.items.get((Key["companyId"], Key["reportId"]))
        return {"Item": copy.deepcopy(item)} if item else {}

    def put_item(self, Item, ConditionExpression=None, ExpressionAttributeValues=None):
        key = (Item["companyId"], Item["reportId"])
        existing = self.items.get(key)
        if ConditionExpression == "attribute_not_exists(reportId)" and existing:
            raise conditional_failure()
        if ConditionExpression and ConditionExpression.startswith("attribute_exists(reportId)"):
            if not existing or existing["ownerUserId"] != ExpressionAttributeValues[":previousOwner"]:
                raise conditional_failure()
        self.items[key] = copy.deepcopy(Item)

    def delete_item(self, Key):
        self.items.pop((Key["companyId"], Key["reportId"]), None)

    def query(self, KeyConditionExpression, ExpressionAttributeValues, **_kwargs):
        self.query_calls += 1
        company_id = ExpressionAttributeValues[":companyId"]
        return {"Items": [copy.deepcopy(item) for (company, _), item in self.items.items() if company == company_id]}


class FakeSharesTable:
    def __init__(self):
        self.items = {}

    def get_item(self, Key):
        item = self.items.get(Key["shareId"])
        return {"Item": copy.deepcopy(item)} if item else {}

    def put_item(self, Item):
        self.items[Item["shareId"]] = copy.deepcopy(Item)


def make_user(user_id, company_id, role, email=None):
    return {"sub": user_id, "custom:companyId": company_id, "custom:role": role, "email": email or f"{user_id}@example.com"}


ADMIN_A = make_user("admin-a", "acme", "admin")
REP_A1 = make_user("rep-1", "acme", "rep")
REP_A2 = make_user("rep-2", "acme", "rep")
ADMIN_B = make_user("admin-b", "other", "admin")


def make_report(report_id="report-1", storage_key=None, preview_url=None):
    evidence = {
        "photoId": "p1",
        "fileName": "roof.jpg",
        "caption": "Ridge line",
        "observations": ["no-obvious-damage"],
        "source": "rep-entered",
    }
    if storage_key:
        evidence["storageKey"] = storage_key
    if preview_url:
        evidence["previewUrl"] = preview_url
    return {
        "id": report_id,
        "title": "Roof for Pat",
        "createdAt": "2026-01-01T00:00:00Z",
        "details": {
            "homeownerName": "Pat Owner",
            "propertyAddress": "1 Main St",
            "roofAgeYears": 18,
            "roofMaterial": "asphalt-shingle",
            "knownLeaks": "no",
            "existingSolar": "no",
            "utilityBillAvailable": "yes",
            "desiredOutcome": "roof-and-solar",
            "repNotes": "REP-NOTE-MARKER",
            "visibleConditionFlags": ["no-obvious-damage"],
        },
        "report": {
            "generatedAt": "2026-01-01T00:00:00Z",
            "assessmentMode": "rule-based",
            "scores": {
                "roofAgeRisk": 40,
                "visibleConditionRisk": 10,
                "leakRisk": 0,
                "solarReadiness": 70,
                "urgency": 20,
                "dataCompleteness": 80,
                "totalRisk": 30,
            },
            "recommendation": {
                "status": "solar-ready",
                "label": "Solar ready",
                "recommendedSalesPath": "SALES-PATH-MARKER",
                "confidence": "medium",
                "confidenceRationale": "Photos look fine.",
                "nextBestAction": "NEXT-ACTION-MARKER",
                "avoidSaying": "AVOID-SAYING-MARKER",
            },
            "keyObservations": ["No visible damage."],
            "roofRiskFactors": [],
            "solarReadinessFactors": ["South facing."],
            "questionsToAsk": ["Any leaks?"],
            "photoEvidence": [evidence],
            "photoAnalysis": [],
            "analysisTrace": [{"label": "TRACE-MARKER", "source": "rules", "detail": "x"}],
            "suggestedTalkTrack": "TALK-TRACK-MARKER",
            "disclaimer": "Not an inspection.",
            "leadQualityScore": 87,
        },
        "company": {"companyName": "Acme Roofing", "repName": "Rae", "phone": "555", "email": "rae@acme.test", "licenseNote": ""},
        "photoCount": 1,
        "photoNames": ["roof.jpg"],
        "auditTrail": [{"id": "a1", "timestamp": "t", "actor": "AUDIT-MARKER", "action": "x", "detail": "y"}],
        "clientOnly": "CLIENT-ONLY-MARKER",
    }


class AppTestCase(unittest.TestCase):
    def setUp(self):
        self.reports = FakeReportsTable()
        self.shares = FakeSharesTable()
        self.s3 = mock.MagicMock()
        self.s3.generate_presigned_url.side_effect = lambda _op, Params, **_kw: f"https://signed.example/{Params['Key']}?sig=1"
        self.s3.generate_presigned_post.return_value = {
            "url": "https://photo-bucket.s3.amazonaws.com/",
            "fields": {"key": "k", "Content-Type": "image/jpeg", "policy": "p"},
        }
        self.s3.delete_objects.return_value = {}
        self.usage = mock.MagicMock()
        for name, value in {
            "reports_table": self.reports,
            "shares_table": self.shares,
            "usage_table": self.usage,
            "s3": self.s3,
        }.items():
            patcher = mock.patch.object(app, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = mock.patch.dict(app._secret_cache, {}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.logs = ""

    def call(self, method, path, user=None, body=None):
        event = {
            "rawPath": path,
            "headers": {"origin": "https://app.example"},
            "requestContext": {"requestId": "req-123", "http": {"method": method}},
        }
        if user is not None:
            event["requestContext"]["authorizer"] = {"jwt": {"claims": user}}
        if body is not None:
            event["body"] = json.dumps(body)
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            response = app.handler(event, None)
        self.logs += captured.getvalue()
        return response["statusCode"], json.loads(response["body"]) if response["body"] else None

    def save(self, user, report):
        status, payload = self.call("POST", "/reports", user, {"savedReport": report})
        self.assertEqual(status, 200, payload)
        return payload["report"]

    def seed(self, company_id, report, owner, expires_in=3600):
        """Insert a stored report directly, bypassing request validation (simulates legacy data)."""
        self.reports.items[(company_id, report["id"])] = {
            "companyId": company_id,
            "reportId": report["id"],
            "ownerUserId": owner,
            "ownerEmail": f"{owner}@example.com",
            "title": report["title"],
            "payload": json.dumps(report),
            "expiresAt": int(time.time()) + expires_in,
        }


class ClaimsTests(AppTestCase):
    def test_missing_company_claim_fails_closed(self):
        user = {"sub": "u1", "custom:role": "admin"}
        status, _ = self.call("GET", "/reports", user)
        self.assertEqual(status, 403)
        self.assertEqual(self.reports.query_calls, 0)

    def test_missing_or_unknown_role_fails_closed(self):
        for role in (None, "", "owner", "ADMIN"):
            user = {"sub": "u1", "custom:companyId": "acme"}
            if role is not None:
                user["custom:role"] = role
            status, _ = self.call("GET", "/reports", user)
            self.assertEqual(status, 403, role)

    def test_company_ids_are_validated_not_sanitized(self):
        for company_id in ("acme/../other", "acme corp", "acme\n", "", "-acme", "a" * 81, "acme!"):
            status, _ = self.call("GET", "/reports", make_user("u1", company_id, "admin"))
            self.assertEqual(status, 403, repr(company_id))
        self.assertEqual(self.reports.query_calls, 0)

    def test_missing_subject_is_unauthorized(self):
        status, _ = self.call("GET", "/reports", {"custom:companyId": "acme", "custom:role": "admin"})
        self.assertEqual(status, 401)

    def test_no_claims_is_unauthorized(self):
        status, _ = self.call("GET", "/reports")
        self.assertEqual(status, 401)


class TenantStorageTests(AppTestCase):
    def test_foreign_storage_key_is_rejected_on_save(self):
        for key in (OTHER_KEY, "companies/acme/uploads", "companies/acme/uploads/", "companies/acmeX/uploads/a/b.jpg",
                    f"companies/acme/uploads/../../other/uploads/{HEX}/roof.jpg", "uploads/x.jpg", 123):
            status, _ = self.call("POST", "/reports", REP_A1, {"savedReport": make_report(storage_key=key)})
            self.assertEqual(status, 400, key)
        self.assertEqual(self.reports.items, {})

    def test_own_storage_key_is_stored_and_client_preview_url_replaced(self):
        report = make_report(storage_key=ACME_KEY, preview_url="https://evil.example/tracker.png")
        returned = self.save(REP_A1, report)

        stored = json.loads(self.reports.items[("acme", "report-1")]["payload"])
        stored_evidence = stored["report"]["photoEvidence"][0]
        self.assertEqual(stored_evidence["storageKey"], ACME_KEY)
        self.assertNotIn("previewUrl", stored_evidence)

        returned_evidence = returned["report"]["photoEvidence"][0]
        self.assertEqual(returned_evidence["previewUrl"], f"https://signed.example/{ACME_KEY}?sig=1")

    def test_external_preview_urls_are_dropped_but_demo_images_survive(self):
        report = make_report(preview_url="https://evil.example/tracker.png")
        report["report"]["photoEvidence"].append(
            {"photoId": "p2", "fileName": "d.jpg", "caption": "", "observations": [], "source": "demo", "previewUrl": "/demo-roof-photos/d.jpg"}
        )
        self.save(REP_A1, report)
        stored = json.loads(self.reports.items[("acme", "report-1")]["payload"])["report"]["photoEvidence"]
        self.assertNotIn("previewUrl", stored[0])
        self.assertEqual(stored[1]["previewUrl"], "/demo-roof-photos/d.jpg")

    def test_legacy_foreign_key_is_never_presigned(self):
        self.seed("acme", make_report(storage_key=OTHER_KEY, preview_url="https://evil.example/x.png"), "rep-1")
        status, payload = self.call("GET", "/reports/report-1", REP_A1)
        self.assertEqual(status, 200)
        evidence = payload["report"]["report"]["photoEvidence"][0]
        self.assertNotIn("storageKey", evidence)
        self.assertNotIn("previewUrl", evidence)
        self.s3.generate_presigned_url.assert_not_called()

        status, payload = self.call("GET", "/reports", REP_A1)
        self.assertNotIn("previewUrl", payload["reports"][0]["report"]["photoEvidence"][0])
        self.s3.generate_presigned_url.assert_not_called()

    def test_other_company_cannot_read_report(self):
        self.seed("acme", make_report(), "rep-1")
        status, _ = self.call("GET", "/reports/report-1", ADMIN_B)
        self.assertEqual(status, 404)
        status, payload = self.call("GET", "/reports", ADMIN_B)
        self.assertEqual(payload["reports"], [])

    def test_report_ids_with_unsafe_characters_are_rejected(self):
        status, _ = self.call("POST", "/reports", REP_A1, {"savedReport": make_report(report_id="a/b")})
        self.assertEqual(status, 400)

    def test_presign_issues_constrained_post_under_company_prefix(self):
        status, payload = self.call(
            "POST", "/photos/presign", REP_A1, {"fileName": "../My Roof.jpg", "contentType": "IMAGE/JPEG", "sizeBytes": 1000}
        )
        self.assertEqual(status, 200)
        kwargs = self.s3.generate_presigned_post.call_args.kwargs
        self.assertTrue(kwargs["Key"].startswith("companies/acme/uploads/"))
        self.assertEqual(kwargs["Bucket"], "photo-bucket")
        self.assertEqual(kwargs["Fields"], {"Content-Type": "image/jpeg"})
        self.assertIn({"Content-Type": "image/jpeg"}, kwargs["Conditions"])
        self.assertIn(["content-length-range", 1, 12 * 1024 * 1024], kwargs["Conditions"])
        self.assertEqual(kwargs["ExpiresIn"], 900)
        self.s3.generate_presigned_url.assert_not_called()
        self.assertEqual(payload["storageKey"], kwargs["Key"])
        self.assertEqual(payload["uploadUrl"], "https://photo-bucket.s3.amazonaws.com/")
        self.assertEqual(payload["uploadFields"]["Content-Type"], "image/jpeg")
        self.assertTrue(app.is_company_storage_key(payload["storageKey"], "acme"))

    def test_presign_rejects_bad_type_and_size(self):
        for body in (
            {"contentType": "text/html", "sizeBytes": 10},
            {"contentType": "image/png", "sizeBytes": 12 * 1024 * 1024 + 1},
            {"contentType": "image/png", "sizeBytes": 0},
            {"contentType": "image/png", "sizeBytes": "many"},
        ):
            status, _ = self.call("POST", "/photos/presign", REP_A1, body)
            self.assertEqual(status, 400, body)
        self.s3.generate_presigned_post.assert_not_called()


class ExpirationAndSizeTests(AppTestCase):
    def test_expired_reports_are_hidden_before_ttl_deletion(self):
        self.seed("acme", make_report("old"), "rep-1", expires_in=-5)
        self.seed("acme", make_report("fresh"), "rep-1")

        status, _ = self.call("GET", "/reports/old", REP_A1)
        self.assertEqual(status, 404)
        status, payload = self.call("GET", "/reports", REP_A1)
        self.assertEqual([r["id"] for r in payload["reports"]], ["fresh"])
        status, _ = self.call("POST", "/reports/old/share", REP_A1)
        self.assertEqual(status, 404)
        status, _ = self.call("POST", "/reports/old/crm-export", REP_A1)
        self.assertEqual(status, 404)

    def test_items_without_valid_expiry_are_treated_as_expired(self):
        self.seed("acme", make_report("odd"), "rep-1")
        self.reports.items[("acme", "odd")].pop("expiresAt")
        status, _ = self.call("GET", "/reports/odd", REP_A1)
        self.assertEqual(status, 404)

    def test_share_link_for_report_that_later_expires_stops_working(self):
        self.seed("acme", make_report(), "rep-1")
        status, payload = self.call("POST", "/reports/report-1/share", REP_A1)
        self.assertEqual(status, 200)
        share_id = payload["shareId"]
        self.assertLessEqual(payload["expiresAt"], self.reports.items[("acme", "report-1")]["expiresAt"])

        self.reports.items[("acme", "report-1")]["expiresAt"] = int(time.time()) - 1
        status, _ = self.call("GET", f"/share/{share_id}")
        self.assertEqual(status, 404)

    def test_expired_share_link_is_rejected(self):
        self.seed("acme", make_report(), "rep-1")
        self.shares.items["share-old"] = {"shareId": "share-old", "companyId": "acme", "reportId": "report-1", "expiresAt": int(time.time()) - 1}
        status, _ = self.call("GET", "/share/share-old")
        self.assertEqual(status, 404)

    def test_oversized_report_is_rejected_below_dynamodb_limit(self):
        report = make_report()
        report["details"]["repNotes"] = "x" * (app.MAX_REPORT_PAYLOAD_BYTES + 1)
        status, _ = self.call("POST", "/reports", REP_A1, {"savedReport": report})
        self.assertEqual(status, 413)
        self.assertEqual(self.reports.items, {})
        self.assertLess(app.MAX_REPORT_PAYLOAD_BYTES, 400 * 1024)

    def test_report_just_under_limit_is_accepted(self):
        report = make_report()
        report["details"]["repNotes"] = "x" * (app.MAX_REPORT_PAYLOAD_BYTES - 10_000)
        self.save(REP_A1, report)


class SharedReportTests(AppTestCase):
    def test_shared_sample_keeps_its_label_and_is_not_cacheable(self):
        report = make_report()
        report["sample"] = True
        self.save(REP_A1, report)
        _, share = self.call("POST", "/reports/report-1/share", REP_A1)
        event = {
            "rawPath": f"/share/{share['shareId']}",
            "headers": {},
            "requestContext": {"http": {"method": "GET"}},
        }
        response = app.handler(event, None)
        self.assertTrue(json.loads(response["body"])["report"]["sample"])
        self.assertEqual(response["headers"]["Cache-Control"], "no-store")

    def share(self):
        self.save(REP_A1, make_report(storage_key=ACME_KEY, preview_url="https://evil.example/x.png"))
        status, payload = self.call("POST", "/reports/report-1/share", REP_A1)
        self.assertEqual(status, 200)
        return payload["shareId"]

    def test_shared_view_omits_rep_only_fields(self):
        status, payload = self.call("GET", f"/share/{self.share()}")
        self.assertEqual(status, 200)
        raw = json.dumps(payload)
        for marker in (
            "REP-NOTE-MARKER",
            "SALES-PATH-MARKER",
            "NEXT-ACTION-MARKER",
            "AVOID-SAYING-MARKER",
            "TALK-TRACK-MARKER",
            "AUDIT-MARKER",
            "TRACE-MARKER",
            "CLIENT-ONLY-MARKER",
            "evil.example",
            "storageKey",
            "auditTrail",
            "avoidSaying",
        ):
            self.assertNotIn(marker, raw)

        report = payload["report"]
        self.assertEqual(report["details"]["repNotes"], "")
        self.assertEqual(report["report"]["suggestedTalkTrack"], "")
        self.assertEqual(report["report"]["leadQualityScore"], 0)
        self.assertEqual(report["report"]["recommendation"]["recommendedSalesPath"], "")
        self.assertEqual(report["report"]["recommendation"]["nextBestAction"], "")
        self.assertEqual(report["report"]["analysisTrace"], [])
        self.assertNotIn("auditTrail", report)

    def test_shared_view_keeps_homeowner_content_and_company_presigned_photo(self):
        status, payload = self.call("GET", f"/share/{self.share()}")
        report = payload["report"]
        self.assertEqual(report["details"]["homeownerName"], "Pat Owner")
        self.assertEqual(report["report"]["recommendation"]["label"], "Solar ready")
        self.assertEqual(report["report"]["keyObservations"], ["No visible damage."])
        self.assertEqual(report["company"]["companyName"], "Acme Roofing")
        self.assertEqual(report["report"]["photoEvidence"][0]["previewUrl"], f"https://signed.example/{ACME_KEY}?sig=1")

    def test_shared_view_never_signs_foreign_keys(self):
        self.seed("acme", make_report(storage_key=OTHER_KEY), "rep-1")
        self.shares.items["share-x"] = {"shareId": "share-x", "companyId": "acme", "reportId": "report-1", "expiresAt": int(time.time()) + 100}
        status, payload = self.call("GET", "/share/share-x")
        self.assertEqual(status, 200)
        self.assertNotIn("previewUrl", payload["report"]["report"]["photoEvidence"][0])
        self.s3.generate_presigned_url.assert_not_called()

    def test_shared_view_ignores_non_string_junk_in_allowlisted_fields(self):
        report = make_report()
        report["details"]["homeownerName"] = {"nested": "<img src=x>"}
        report["report"]["keyObservations"] = ["ok", {"a": 1}, 5]
        self.seed("acme", report, "rep-1")
        self.shares.items["share-j"] = {"shareId": "share-j", "companyId": "acme", "reportId": "report-1", "expiresAt": int(time.time()) + 100}
        _, payload = self.call("GET", "/share/share-j")
        self.assertEqual(payload["report"]["details"]["homeownerName"], "")
        self.assertEqual(payload["report"]["report"]["keyObservations"], ["ok"])


class RoleTests(AppTestCase):
    def test_reads_are_company_wide(self):
        self.seed("acme", make_report(), "rep-1")
        status, payload = self.call("GET", "/reports/report-1", REP_A2)
        self.assertEqual(status, 200)
        status, payload = self.call("GET", "/reports", REP_A2)
        self.assertEqual(len(payload["reports"]), 1)

    def test_rep_cannot_overwrite_another_owners_report(self):
        self.seed("acme", make_report(), "rep-1")
        edited = make_report()
        edited["title"] = "Hijacked"
        status, _ = self.call("POST", "/reports", REP_A2, {"savedReport": edited})
        self.assertEqual(status, 403)
        self.assertEqual(self.reports.items[("acme", "report-1")]["title"], "Roof for Pat")

    def test_rep_can_edit_own_report_and_keeps_ownership(self):
        self.save(REP_A1, make_report())
        edited = make_report()
        edited["title"] = "Updated"
        self.save(REP_A1, edited)
        item = self.reports.items[("acme", "report-1")]
        self.assertEqual(item["title"], "Updated")
        self.assertEqual(item["ownerUserId"], "rep-1")

    def test_admin_can_edit_but_original_owner_is_preserved(self):
        self.seed("acme", make_report(), "rep-1")
        edited = make_report()
        edited["title"] = "Admin edit"
        self.save(ADMIN_A, edited)
        item = self.reports.items[("acme", "report-1")]
        self.assertEqual(item["title"], "Admin edit")
        self.assertEqual(item["ownerUserId"], "rep-1")
        self.assertEqual(item["ownerEmail"], "rep-1@example.com")

    def test_same_report_id_in_other_company_is_independent(self):
        self.seed("acme", make_report(), "rep-1")
        self.save(ADMIN_B, make_report())
        self.assertEqual(self.reports.items[("acme", "report-1")]["ownerUserId"], "rep-1")
        self.assertEqual(self.reports.items[("other", "report-1")]["ownerUserId"], "admin-b")

    def test_concurrent_creation_loses_to_existing_item(self):
        # Simulates another writer creating the ID between our read and write.
        original_get = self.reports.get_item
        self.reports.get_item = lambda Key: (self.seed("acme", make_report(), "rep-1"), {})[1]
        status, _ = self.call("POST", "/reports", REP_A2, {"savedReport": make_report()})
        self.reports.get_item = original_get
        self.assertEqual(status, 409)
        self.assertEqual(self.reports.items[("acme", "report-1")]["ownerUserId"], "rep-1")

    def test_rep_cannot_share_export_or_delete_other_reps_report(self):
        self.seed("acme", make_report(), "rep-1")
        for method, path in (("POST", "/reports/report-1/share"), ("POST", "/reports/report-1/crm-export"), ("DELETE", "/reports/report-1")):
            status, _ = self.call(method, path, REP_A2)
            self.assertEqual(status, 403, path)
        self.assertEqual(self.shares.items, {})
        self.assertIn(("acme", "report-1"), self.reports.items)
        self.s3.delete_objects.assert_not_called()

    def test_rep_can_share_export_and_delete_own_report(self):
        self.seed("acme", make_report(), "rep-1")
        self.assertEqual(self.call("POST", "/reports/report-1/share", REP_A1)[0], 200)
        self.assertEqual(self.call("POST", "/reports/report-1/crm-export", REP_A1)[0], 200)
        self.assertEqual(self.call("DELETE", "/reports/report-1", REP_A1)[0], 200)
        self.assertNotIn(("acme", "report-1"), self.reports.items)

    def test_admin_can_manage_any_report_in_company_but_not_other_companies(self):
        self.seed("acme", make_report(), "rep-1")
        self.assertEqual(self.call("POST", "/reports/report-1/share", ADMIN_A)[0], 200)
        self.assertEqual(self.call("POST", "/reports/report-1/crm-export", ADMIN_A)[0], 200)
        self.assertEqual(self.call("DELETE", "/reports/report-1", ADMIN_B)[0], 200)  # nothing to delete in company "other"
        self.assertIn(("acme", "report-1"), self.reports.items)
        self.assertEqual(self.call("DELETE", "/reports/report-1", ADMIN_A)[0], 200)
        self.assertNotIn(("acme", "report-1"), self.reports.items)


class DeleteTests(AppTestCase):
    def test_deleting_one_report_keeps_photos_used_by_another_report(self):
        self.seed("acme", make_report(storage_key=ACME_KEY), "rep-1")
        self.seed("acme", make_report("report-2", storage_key=ACME_KEY), "rep-2")
        status, shared = self.call("POST", "/reports/report-1/share", REP_A1)
        self.assertEqual(status, 200)
        self.assertEqual(self.call("DELETE", "/reports/report-1", REP_A1)[0], 200)
        self.assertNotIn(("acme", "report-1"), self.reports.items)
        self.assertEqual(self.call("GET", f"/share/{shared['shareId']}")[0], 404)
        status, other = self.call("GET", "/reports/report-2", REP_A2)
        self.assertEqual(status, 200)
        self.assertEqual(other["report"]["report"]["photoEvidence"][0]["storageKey"], ACME_KEY)
        self.s3.delete_objects.assert_not_called()

    def test_expired_report_can_still_be_cleaned_up_by_owner(self):
        self.seed("acme", make_report(storage_key=ACME_KEY), "rep-1", expires_in=-5)
        self.assertEqual(self.call("DELETE", "/reports/report-1", REP_A1)[0], 200)
        self.s3.delete_objects.assert_not_called()
        self.assertNotIn(("acme", "report-1"), self.reports.items)


class CsvTests(AppTestCase):
    def test_csv_safe_neutralizes_formula_prefixes(self):
        for value in ("=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1", "  =1+1", "\n=1"):
            self.assertTrue(app.csv_safe(value).startswith("'"), repr(value))
        for value in ("Pat Owner", "1 Main St", "", None):
            self.assertFalse(str(app.csv_safe(value)).startswith("'"), repr(value))
        self.assertEqual(app.csv_safe(87), 87)

    def test_export_neutralizes_report_fields(self):
        report = make_report()
        report["details"]["homeownerName"] = '=HYPERLINK("http://evil.example","x")'
        report["details"]["propertyAddress"] = "+1 Main St"
        report["company"]["repName"] = "@rep"
        report["report"]["recommendation"]["nextBestAction"] = "-cmd|' /C calc'!A0"
        self.seed("acme", report, "rep-1")
        status, payload = self.call("POST", "/reports/report-1/crm-export", REP_A1)
        self.assertEqual(status, 200)
        header, row = list(csv.reader(io.StringIO(payload["csv"])))
        cells = dict(zip(header, row))
        for column in ("homeowner_name", "property_address", "rep_name", "next_best_action"):
            self.assertTrue(cells[column].startswith("'"), column)
        self.assertEqual(cells["status"], "solar-ready")
        self.assertEqual(payload["fileName"], "report-1-crm-export.csv")


class LoggingAndProviderTests(AppTestCase):
    def test_request_log_is_metadata_only(self):
        self.seed("acme", make_report(), "rep-1")
        user = make_user("rep-1", "acme", "rep", email="private@example.com")
        self.call("GET", "/reports/report-1", user)
        self.call("GET", "/share/share-supersecret123")
        self.call("POST", "/reports/report-1/share", user)

        lines = [json.loads(line) for line in self.logs.splitlines()]
        self.assertEqual(len(lines), 3)
        for line in lines:
            self.assertEqual(set(line), {"level", "event", "requestId", "method", "path", "status", "durationMs"})
            self.assertEqual(line["requestId"], "req-123")
            self.assertIsInstance(line["durationMs"], int)
        self.assertEqual([line["path"] for line in lines], ["/reports/{reportId}", "/share/{shareId}", "/reports/{reportId}/share"])
        self.assertEqual([line["status"] for line in lines], [200, 404, 200])
        for secret in ("private@example.com", "share-supersecret123", "1 Main St", "Pat Owner", "rep-1", "signed.example"):
            self.assertNotIn(secret, self.logs)

    def test_unknown_paths_are_logged_as_unmatched(self):
        self.call("GET", "/wp-login.php?x=secret")
        self.assertEqual(json.loads(self.logs.splitlines()[0])["path"], "unmatched")

    def test_unhandled_error_logs_type_only(self):
        self.reports.query = mock.Mock(side_effect=RuntimeError("1 Main St private@example.com"))
        status, payload = self.call("GET", "/reports", REP_A1)
        self.assertEqual(status, 500)
        self.assertEqual(payload, {"error": "Server error."})
        self.assertIn("RuntimeError", self.logs)
        self.assertNotIn("1 Main St", self.logs)
        self.assertNotIn("private@example.com", self.logs)

    def test_options_returns_empty_204(self):
        event = {"rawPath": "/reports", "headers": {"origin": "https://app.example"}, "requestContext": {"http": {"method": "OPTIONS"}}}
        with contextlib.redirect_stdout(io.StringIO()):
            response = app.handler(event, None)
        self.assertEqual(response["statusCode"], 204)
        self.assertEqual(response["body"], "")

    def gemini_body(self):
        return {"photos": [{"photoId": "p1", "fileName": "a.jpg", "mimeType": "image/jpeg", "dataBase64": "AAAA"}]}

    def test_gemini_http_error_does_not_leak_provider_body_or_key(self):
        app._secret_cache[app.GEMINI_PARAM_NAME] = "AIzaSECRETKEY"
        error = urllib.error.HTTPError(
            "https://generativelanguage.googleapis.com/x", 403, "Forbidden", {}, io.BytesIO(b'{"error":"key AIzaSECRETKEY rejected for project 99"}')
        )
        with mock.patch.object(app.urllib.request, "urlopen", side_effect=error):
            status, payload = self.call("POST", "/photo-evidence-suggestions", REP_A1, self.gemini_body())
        self.assertEqual(status, 502)
        self.assertEqual(payload, {"configured": True, "suggestions": [], "error": "Gemini returned 403."})
        for text in (json.dumps(payload), self.logs):
            self.assertNotIn("AIzaSECRETKEY", text)
            self.assertNotIn("project 99", text)
        self.assertIn('"providerStatus":403', self.logs)

    def test_gemini_network_failure_is_generic(self):
        app._secret_cache[app.GEMINI_PARAM_NAME] = "AIzaSECRETKEY"
        with mock.patch.object(app.urllib.request, "urlopen", side_effect=urllib.error.URLError("dns failure for AIzaSECRETKEY")):
            status, payload = self.call("POST", "/photo-evidence-suggestions", REP_A1, self.gemini_body())
        self.assertEqual(status, 502)
        self.assertEqual(payload["error"], "Gemini request failed.")
        self.assertNotIn("AIzaSECRETKEY", json.dumps(payload) + self.logs)

    def test_gemini_rejects_unsupported_mime_type(self):
        body = self.gemini_body()
        body["photos"][0]["mimeType"] = "text/html"
        status, _ = self.call("POST", "/photo-evidence-suggestions", REP_A1, body)
        self.assertEqual(status, 400)

    def test_nrel_failure_does_not_echo_exception_or_key(self):
        app._secret_cache[app.NREL_PARAM_NAME] = "NRELSECRET"
        geocode = {"provider": "us-census", "status": "matched", "latitude": 40.0, "longitude": -75.0}
        failure = Exception("failed https://developer.nrel.gov/api/pvwatts/v8.json?api_key=NRELSECRET")
        body = {
            "details": {"propertyAddress": "1 Main St"},
            "assumptions": {"usableRoofAreaSqft": 500, "roofOrientation": "south", "panelWattage": 410, "shadeLevel": "low", "roofPitchDegrees": 20},
        }
        with mock.patch.object(app, "geocode_address", return_value=geocode), mock.patch.object(app.urllib.request, "urlopen", side_effect=failure):
            status, payload = self.call("POST", "/solar-estimate", REP_A1, body)
        self.assertEqual(status, 200)
        self.assertIn("NREL PVWatts estimate failed; using local assumptions.", payload["estimate"]["warnings"])
        self.assertNotIn("NRELSECRET", json.dumps(payload) + self.logs)

    def test_geocode_failure_message_is_static(self):
        with mock.patch.object(app.urllib.request, "urlopen", side_effect=Exception("boom 1 Main St")):
            result = app.geocode_address("1 Main St")
        self.assertEqual(result["message"], "Address geocoding failed.")


if __name__ == "__main__":
    unittest.main()
