import base64
import csv
import io
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError


REPORTS_TABLE = os.environ["REPORTS_TABLE"]
SHARES_TABLE = os.environ["SHARES_TABLE"]
USAGE_TABLE = os.environ["USAGE_TABLE"]
ACCESS_REQUESTS_TABLE = os.environ["ACCESS_REQUESTS_TABLE"]
PHOTO_BUCKET = os.environ["PHOTO_BUCKET"]
GEMINI_PARAM_NAME = os.environ["GEMINI_PARAM_NAME"]
NREL_PARAM_NAME = os.environ["NREL_PARAM_NAME"]
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
ALLOWED_ORIGINS = {origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()}
RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "90"))
SHARE_LINK_TTL_DAYS = int(os.environ.get("SHARE_LINK_TTL_DAYS", "30"))
GEMINI_DAILY_LIMIT = int(os.environ.get("GEMINI_DAILY_LIMIT", "100"))
NREL_DAILY_LIMIT = int(os.environ.get("NREL_DAILY_LIMIT", "300"))

ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
MAX_PHOTO_BYTES = 12 * 1024 * 1024
MAX_GEMINI_PHOTOS = 8
PANEL_AREA_SQFT = 21.5
LOCAL_KWH_PER_KW_YEAR = 1250
MONTHLY_SHAPE = [0.065, 0.073, 0.087, 0.095, 0.102, 0.104, 0.104, 0.096, 0.087, 0.076, 0.059, 0.052]
ORIENTATION_AZIMUTH = {
    "south": 180,
    "south-east": 135,
    "south-west": 225,
    "east": 90,
    "west": 270,
    "north": 0,
}
ORIENTATION_FACTOR = {
    "south": 1,
    "south-east": 0.94,
    "south-west": 0.94,
    "east": 0.84,
    "west": 0.84,
    "north": 0.55,
    "unknown": 0.82,
}
SHADE_FACTOR = {
    "low": 1,
    "moderate": 0.82,
    "heavy": 0.58,
    "unknown": 0.85,
}
ALLOWED_FLAGS = [
    "no-obvious-damage",
    "curling-or-lifted-shingles",
    "missing-or-damaged-shingles",
    "granule-loss-or-bare-spots",
    "damaged-flashing-or-penetrations",
    "valley-or-gutter-wear",
    "sagging-or-soft-decking",
    "interior-staining",
    "limited-or-unclear-photos",
]

dynamodb = boto3.resource("dynamodb")
reports_table = dynamodb.Table(REPORTS_TABLE)
shares_table = dynamodb.Table(SHARES_TABLE)
usage_table = dynamodb.Table(USAGE_TABLE)
access_requests_table = dynamodb.Table(ACCESS_REQUESTS_TABLE)
s3 = boto3.client("s3")
ssm = boto3.client("ssm")
_secret_cache = {}


def handler(event, _context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    path = event.get("rawPath", "")

    if method == "OPTIONS":
        return respond({}, 204, event)

    try:
        if method == "GET" and path == "/health":
            return respond({"ok": True, "service": "roofsignal-aws-api"}, 200, event)
        if method == "POST" and path == "/request-access":
            return create_access_request(event)
        if method == "GET" and path.startswith("/share/"):
            return get_shared_report(event, path.rsplit("/", 1)[-1])

        user = get_user_context(event)
        if not user:
            return respond({"error": "Unauthorized."}, 401, event)

        if method == "GET" and path == "/reports":
            return list_reports(event, user)
        if method == "POST" and path == "/reports":
            return create_report(event, user)
        if method == "POST" and path == "/photos/presign":
            return create_photo_presign(event, user)
        if method == "POST" and path == "/photo-evidence-suggestions":
            return create_gemini_suggestions(event, user)
        if method == "POST" and path == "/solar-estimate":
            return create_solar_estimate(event, user)

        report_match = re.match(r"^/reports/([^/]+)$", path)
        if report_match and method == "GET":
            return get_report(event, user, report_match.group(1))
        if report_match and method == "DELETE":
            return delete_report(event, user, report_match.group(1))

        share_match = re.match(r"^/reports/([^/]+)/share$", path)
        if share_match and method == "POST":
            return create_share_link(event, user, share_match.group(1))

        export_match = re.match(r"^/reports/([^/]+)/crm-export$", path)
        if export_match and method == "POST":
            return create_crm_export(event, user, export_match.group(1))

        return respond({"error": "Route not found."}, 404, event)
    except RateLimitExceeded as error:
        return respond({"error": str(error)}, 429, event)
    except ValueError as error:
        return respond({"error": str(error)}, 400, event)
    except Exception as error:
        print(f"Unhandled error: {error}")
        return respond({"error": "Server error."}, 500, event)


def create_access_request(event):
    payload = read_json(event)
    email = str(payload.get("email", "")).strip().lower()
    if not email or "@" not in email:
        raise ValueError("A valid work email is required.")

    now = now_iso()
    request_id = f"access-{uuid.uuid4()}"
    access_requests_table.put_item(
        Item={
            "requestId": request_id,
            "email": email,
            "name": str(payload.get("name", "")).strip()[:120],
            "companyName": str(payload.get("companyName", "")).strip()[:160],
            "phone": str(payload.get("phone", "")).strip()[:80],
            "notes": str(payload.get("notes", "")).strip()[:1200],
            "createdAt": now,
            "expiresAt": int(time.time()) + 365 * 24 * 3600,
        }
    )
    return respond({"ok": True, "requestId": request_id}, 200, event)


def list_reports(event, user):
    response = reports_table.query(
        KeyConditionExpression="companyId = :companyId",
        ExpressionAttributeValues={":companyId": user["companyId"]},
        ScanIndexForward=False,
        Limit=50,
    )
    reports = [public_report_from_item(item) for item in response.get("Items", [])]
    return respond({"reports": reports}, 200, event)


def create_report(event, user):
    payload = read_json(event)
    saved_report = payload.get("savedReport")
    if not isinstance(saved_report, dict):
        raise ValueError("savedReport is required.")

    report_id = safe_id(saved_report.get("id")) or f"report-{uuid.uuid4()}"
    created_at = str(saved_report.get("createdAt") or now_iso())
    saved_report["id"] = report_id
    saved_report["createdAt"] = created_at

    retention_seconds = RETENTION_DAYS * 24 * 3600
    reports_table.put_item(
        Item={
            "companyId": user["companyId"],
            "reportId": report_id,
            "ownerUserId": user["userId"],
            "ownerEmail": user.get("email", ""),
            "title": str(saved_report.get("title") or "Untitled report")[:240],
            "createdAt": created_at,
            "updatedAt": now_iso(),
            "payload": json.dumps(saved_report, separators=(",", ":")),
            "expiresAt": int(time.time()) + retention_seconds,
        }
    )

    return respond({"report": hydrate_report(saved_report)}, 200, event)


def get_report(event, user, report_id):
    item = get_report_item(user["companyId"], report_id)
    if not item:
        return respond({"error": "Report not found."}, 404, event)
    return respond({"report": public_report_from_item(item)}, 200, event)


def delete_report(event, user, report_id):
    reports_table.delete_item(Key={"companyId": user["companyId"], "reportId": report_id})
    return respond({"ok": True}, 200, event)


def create_share_link(event, user, report_id):
    item = get_report_item(user["companyId"], report_id)
    if not item:
        return respond({"error": "Report not found."}, 404, event)

    share_id = f"share-{uuid.uuid4().hex[:18]}"
    expires_at = int(time.time()) + SHARE_LINK_TTL_DAYS * 24 * 3600
    shares_table.put_item(
        Item={
            "shareId": share_id,
            "companyId": user["companyId"],
            "reportId": report_id,
            "createdAt": now_iso(),
            "createdBy": user["userId"],
            "expiresAt": expires_at,
        }
    )
    return respond({"shareId": share_id, "expiresAt": expires_at}, 200, event)


def get_shared_report(event, share_id):
    response = shares_table.get_item(Key={"shareId": share_id})
    share = response.get("Item")
    if not share or int(share.get("expiresAt", 0)) < int(time.time()):
        return respond({"error": "Share link is not available."}, 404, event)

    item = get_report_item(share["companyId"], share["reportId"])
    if not item:
        return respond({"error": "Report not found."}, 404, event)
    return respond({"report": public_report_from_item(item), "shareId": share_id}, 200, event)


def create_crm_export(event, user, report_id):
    item = get_report_item(user["companyId"], report_id)
    if not item:
        return respond({"error": "Report not found."}, 404, event)

    report = json.loads(item["payload"])
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "report_id",
            "created_at",
            "homeowner_name",
            "property_address",
            "status",
            "confidence",
            "lead_quality_score",
            "recommended_sales_path",
            "next_best_action",
            "rep_name",
            "rep_email",
            "company",
        ]
    )
    details = report.get("details", {})
    readiness = report.get("report", {})
    recommendation = readiness.get("recommendation", {})
    company = report.get("company", {})
    writer.writerow(
        [
            report.get("id", ""),
            report.get("createdAt", ""),
            details.get("homeownerName", ""),
            details.get("propertyAddress", ""),
            recommendation.get("status", ""),
            recommendation.get("confidence", ""),
            readiness.get("leadQualityScore", ""),
            recommendation.get("recommendedSalesPath", ""),
            recommendation.get("nextBestAction", ""),
            company.get("repName", ""),
            company.get("email", ""),
            company.get("companyName", ""),
        ]
    )
    return respond({"fileName": f"{report_id}-crm-export.csv", "csv": output.getvalue()}, 200, event)


def create_photo_presign(event, user):
    payload = read_json(event)
    file_name = sanitize_file_name(str(payload.get("fileName", "roof-photo.jpg")))
    content_type = str(payload.get("contentType", "image/jpeg")).lower()
    size_bytes = int(payload.get("sizeBytes", 0) or 0)

    if content_type not in ALLOWED_PHOTO_TYPES:
        raise ValueError("Unsupported photo type.")
    if size_bytes <= 0 or size_bytes > MAX_PHOTO_BYTES:
        raise ValueError("Photo must be between 1 byte and 12 MB.")

    key = f"companies/{user['companyId']}/uploads/{uuid.uuid4().hex}/{file_name}"
    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": PHOTO_BUCKET,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=900,
        HttpMethod="PUT",
    )
    return respond({"uploadUrl": upload_url, "storageKey": key, "expiresIn": 900}, 200, event)


def create_gemini_suggestions(event, user):
    check_rate_limit(f"gemini#{user['companyId']}", GEMINI_DAILY_LIMIT)
    payload = read_json(event)
    photos = payload.get("photos", [])[:MAX_GEMINI_PHOTOS] if isinstance(payload.get("photos"), list) else []
    valid_photos = [
        photo
        for photo in photos
        if isinstance(photo, dict)
        and isinstance(photo.get("photoId"), str)
        and isinstance(photo.get("fileName"), str)
        and isinstance(photo.get("mimeType"), str)
        and isinstance(photo.get("dataBase64"), str)
        and photo.get("dataBase64")
    ]

    if not valid_photos:
        raise ValueError("No valid photos were provided.")

    api_key = get_secret(GEMINI_PARAM_NAME)
    gemini_payload = build_gemini_payload(valid_photos)
    body = json.dumps(gemini_payload).encode("utf-8")
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=18) as response:
            gemini = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8")[:700]
        return respond({"configured": True, "suggestions": [], "error": f"Gemini returned {error.code}.", "details": details}, 502, event)

    model_text = "\n".join(
        part.get("text", "")
        for candidate in gemini.get("candidates", [])
        for part in candidate.get("content", {}).get("parts", [])
        if part.get("text")
    )
    parsed = parse_model_json(model_text)
    suggestions = normalize_suggestions(parsed.get("suggestions", []), valid_photos)
    return respond({"configured": True, "provider": "gemini", "model": GEMINI_MODEL, "suggestions": suggestions, "warnings": parsed.get("warnings", [])}, 200, event)


def create_solar_estimate(event, user):
    check_rate_limit(f"nrel#{user['companyId']}", NREL_DAILY_LIMIT)
    payload = read_json(event)
    details = payload.get("details", {})
    assumptions = payload.get("assumptions", {})
    if not isinstance(details, dict) or not isinstance(assumptions, dict):
        raise ValueError("details and assumptions are required.")

    geocode = geocode_address(str(details.get("propertyAddress", "")))
    local_estimate = estimate_solar(details, assumptions, geocode, "local-assumption", None)
    if geocode.get("status") != "matched" or not geocode.get("latitude") or not geocode.get("longitude"):
        return respond({"estimate": local_estimate}, 200, event)

    system = estimate_system(assumptions)
    azimuth = ORIENTATION_AZIMUTH.get(assumptions.get("roofOrientation"))
    if not system.get("systemCapacityKw") or azimuth is None:
        return respond({"estimate": local_estimate}, 200, event)

    api_key = get_secret(NREL_PARAM_NAME)
    params = {
        "api_key": api_key,
        "lat": str(geocode["latitude"]),
        "lon": str(geocode["longitude"]),
        "system_capacity": str(system["systemCapacityKw"]),
        "azimuth": str(azimuth),
        "tilt": str(assumptions.get("roofPitchDegrees") or 20),
        "array_type": "1",
        "module_type": "0",
        "losses": "14",
        "timeframe": "monthly",
    }
    url = "https://developer.nrel.gov/api/pvwatts/v8.json?" + urllib.parse.urlencode(params)

    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            pvwatts = json.loads(response.read().decode("utf-8"))
    except Exception as error:
        local_estimate["warnings"].append(f"NREL PVWatts estimate failed; using local assumptions. {error}")
        return respond({"estimate": local_estimate}, 200, event)

    outputs = pvwatts.get("outputs", {})
    if not outputs.get("ac_annual"):
        local_estimate["warnings"].extend(pvwatts.get("errors") or ["NREL PVWatts did not return production data."])
        return respond({"estimate": local_estimate}, 200, event)

    estimate = estimate_solar(
        details,
        assumptions,
        geocode,
        "nrel-pvwatts",
        {
            "annualProductionKwh": round(outputs.get("ac_annual")),
            "monthlyProductionKwh": [round(value) for value in outputs.get("ac_monthly", [])],
            "sunHoursPerDay": outputs.get("solrad_annual"),
            "capacityFactorPercent": round(outputs.get("capacity_factor", 0) * 10) / 10 if outputs.get("capacity_factor") else None,
        },
    )
    return respond({"estimate": estimate}, 200, event)


def get_report_item(company_id, report_id):
    response = reports_table.get_item(Key={"companyId": company_id, "reportId": report_id})
    return response.get("Item")


def public_report_from_item(item):
    return hydrate_report(json.loads(item["payload"]))


def hydrate_report(report):
    evidence = report.get("report", {}).get("photoEvidence", [])
    if isinstance(evidence, list):
        for item in evidence:
            storage_key = item.get("storageKey") if isinstance(item, dict) else None
            if storage_key:
                item["previewUrl"] = s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": PHOTO_BUCKET, "Key": storage_key},
                    ExpiresIn=900,
                    HttpMethod="GET",
                )
    return report


def get_user_context(event):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )
    if not claims:
        return None

    user_id = claims.get("sub")
    if not user_id:
        return None

    company_id = claims.get("custom:companyId") or f"company-{user_id}"
    role = claims.get("custom:role") or "admin"
    return {
        "userId": user_id,
        "companyId": safe_company_id(company_id),
        "role": role,
        "email": claims.get("email", ""),
    }


def read_json(event):
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON body.")


def respond(payload, status, event):
    origin = event.get("headers", {}).get("origin") or event.get("headers", {}).get("Origin")
    allowed_origin = origin if origin in ALLOWED_ORIGINS else (next(iter(ALLOWED_ORIGINS), "*"))
    return {
        "statusCode": status,
        "headers": {
            "Access-Control-Allow-Origin": allowed_origin,
            "Access-Control-Allow-Headers": "authorization,content-type",
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
            "Content-Type": "application/json",
        },
        "body": "" if status == 204 else json.dumps(to_jsonable(payload), separators=(",", ":")),
    }


def get_secret(name):
    if name not in _secret_cache:
        _secret_cache[name] = ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]
    return _secret_cache[name]


class RateLimitExceeded(Exception):
    pass


def check_rate_limit(usage_key, limit):
    today = time.strftime("%Y-%m-%d", time.gmtime())
    key = f"{usage_key}#{today}"
    expires_at = int(time.time()) + 2 * 24 * 3600
    try:
        usage_table.update_item(
            Key={"usageKey": key},
            UpdateExpression="ADD requestCount :one SET expiresAt = :expiresAt",
            ConditionExpression="attribute_not_exists(requestCount) OR requestCount < :limit",
            ExpressionAttributeValues={
                ":one": 1,
                ":limit": limit,
                ":expiresAt": expires_at,
            },
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            raise RateLimitExceeded("Daily provider limit reached for this company.")
        raise


def build_gemini_payload(photos):
    parts = [
        {
            "text": "\n".join(
                [
                    "You are assisting a roofing and solar sales rep with pre-appointment visible-risk triage.",
                    "Inspect each roof photo only for visible evidence categories from the allowed tag list.",
                    "Do not claim to perform a licensed inspection, engineering review, insurance decision, or permitting decision.",
                    "Return one suggestion per photo. If a photo is unclear, use limited-or-unclear-photos.",
                    "If no visible issue is apparent, use no-obvious-damage.",
                    "Use concise, homeowner-friendly captions. Keep notes factual and cautious.",
                    "Return JSON only. Do not wrap the JSON in Markdown.",
                    f"Allowed observation tags: {', '.join(ALLOWED_FLAGS)}.",
                ]
            )
        }
    ]
    for index, photo in enumerate(photos):
        parts.append({"text": f"Photo {index + 1}: photoId={photo['photoId']}; fileName={photo['fileName']}"})
        parts.append({"inline_data": {"mime_type": photo["mimeType"], "data": photo["dataBase64"]}})

    return {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }


def parse_model_json(text):
    if not text.strip():
        return {"suggestions": []}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        return json.loads(match.group(0)) if match else {"suggestions": []}


def normalize_suggestions(suggestions, photos):
    photo_ids = {photo["photoId"] for photo in photos}
    seen = set()
    normalized = []
    for suggestion in suggestions if isinstance(suggestions, list) else []:
        photo_id = suggestion.get("photoId") if isinstance(suggestion, dict) else None
        if photo_id not in photo_ids or photo_id in seen:
            continue
        seen.add(photo_id)
        observations = [
            flag
            for flag in suggestion.get("observations", [])
            if isinstance(flag, str) and flag in ALLOWED_FLAGS
        ]
        normalized.append(
            {
                "photoId": photo_id,
                "caption": str(suggestion.get("caption") or "Roof photo reviewed for visible readiness evidence.")[:180],
                "observations": list(dict.fromkeys(observations)) or ["limited-or-unclear-photos"],
                "confidence": clamp_float(suggestion.get("confidence"), 0, 1, 0.45),
                "notes": [str(note)[:160] for note in suggestion.get("notes", [])[:3] if isinstance(note, str)],
            }
        )
    return normalized


def geocode_address(address):
    if not address.strip():
        return {"provider": "us-census", "status": "not-found", "message": "Property address is missing."}

    params = urllib.parse.urlencode(
        {
            "address": address,
            "benchmark": "Public_AR_Current",
            "format": "json",
        }
    )
    url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" + params
    try:
        with urllib.request.urlopen(url, timeout=6) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as error:
        return {"provider": "us-census", "status": "error", "message": f"Address geocoding failed. {error}"}

    matches = payload.get("result", {}).get("addressMatches", [])
    match = matches[0] if matches else None
    coords = match.get("coordinates") if match else None
    if not coords or not coords.get("x") or not coords.get("y"):
        return {"provider": "us-census", "status": "not-found", "message": "Address could not be geocoded."}
    return {
        "provider": "us-census",
        "status": "matched",
        "matchedAddress": match.get("matchedAddress"),
        "latitude": coords.get("y"),
        "longitude": coords.get("x"),
    }


def estimate_solar(details, assumptions, geocode, source, pvwatts):
    system = estimate_system(assumptions)
    if pvwatts:
        annual = pvwatts["annualProductionKwh"]
        monthly = pvwatts["monthlyProductionKwh"]
        sun_hours = pvwatts["sunHoursPerDay"]
        capacity_factor = pvwatts["capacityFactorPercent"]
    else:
        annual = None
        if system["systemCapacityKw"]:
            annual = round(
                system["systemCapacityKw"]
                * LOCAL_KWH_PER_KW_YEAR
                * ORIENTATION_FACTOR.get(assumptions.get("roofOrientation", "unknown"), 0.82)
                * SHADE_FACTOR.get(assumptions.get("shadeLevel", "unknown"), 0.85)
            )
        monthly = [round(annual * share) for share in MONTHLY_SHAPE] if annual is not None else []
        sun_hours = None
        capacity_factor = None

    confidence = solar_confidence(assumptions, geocode, source)
    return {
        "source": source,
        "geocode": geocode,
        "solarScore": solar_score(assumptions, source, geocode, annual, system["systemCapacityKw"]),
        "confidence": confidence,
        "confidenceRationale": solar_confidence_rationale(confidence, source, geocode, assumptions),
        "usableRoofAreaSqft": assumptions.get("usableRoofAreaSqft"),
        "panelCount": system["panelCount"],
        "systemCapacityKw": system["systemCapacityKw"],
        "estimatedDcWatts": system["estimatedDcWatts"],
        "annualProductionKwh": annual,
        "monthlyProductionKwh": monthly,
        "roofOrientation": assumptions.get("roofOrientation", "unknown"),
        "roofPitchDegrees": assumptions.get("roofPitchDegrees"),
        "shadeLevel": assumptions.get("shadeLevel", "unknown"),
        "sunHoursPerDay": sun_hours,
        "capacityFactorPercent": capacity_factor,
        "assumptions": solar_assumptions(assumptions, source),
        "warnings": solar_warnings(details, assumptions, geocode, source),
    }


def estimate_system(assumptions):
    area = assumptions.get("usableRoofAreaSqft")
    watts = assumptions.get("panelWattage") or 410
    if not area or area <= 0 or watts <= 0:
        return {"panelCount": None, "systemCapacityKw": None, "estimatedDcWatts": None}
    panel_count = max(1, int(area // PANEL_AREA_SQFT))
    estimated_dc_watts = panel_count * watts
    return {
        "panelCount": panel_count,
        "systemCapacityKw": round(estimated_dc_watts / 1000, 1),
        "estimatedDcWatts": estimated_dc_watts,
    }


def solar_score(assumptions, source, geocode, annual, capacity):
    orientation = assumptions.get("roofOrientation", "unknown")
    shade = assumptions.get("shadeLevel", "unknown")
    score = 42
    score += ORIENTATION_FACTOR.get(orientation, 0.82) * 25
    score += SHADE_FACTOR.get(shade, 0.85) * 18
    if source == "nrel-pvwatts":
        score += 8
    if geocode.get("status") == "matched":
        score += 5
    if annual and capacity:
        kwh_per_kw = annual / capacity
        score += 8 if kwh_per_kw >= 1450 else 4 if kwh_per_kw >= 1200 else 0
    if not assumptions.get("usableRoofAreaSqft"):
        score -= 22
    if orientation == "unknown":
        score -= 14
    if shade == "unknown":
        score -= 8
    if orientation == "north":
        score -= 18
    if shade == "heavy":
        score -= 16
    return round(max(0, min(100, score)))


def solar_confidence(assumptions, geocode, source):
    if not assumptions.get("usableRoofAreaSqft") or assumptions.get("roofOrientation") == "unknown":
        return "low"
    if source == "nrel-pvwatts" and geocode.get("status") == "matched" and assumptions.get("shadeLevel") != "unknown":
        return "high"
    return "medium"


def solar_confidence_rationale(confidence, source, geocode, assumptions):
    if confidence == "low":
        return "Low because usable roof area or roof direction still needs confirmation."
    if confidence == "medium":
        if source == "nrel-pvwatts" and geocode.get("status") == "matched":
            return "Medium because production uses address-level solar data, but roof area and shading are still rep-entered assumptions."
        return "Medium because the estimate uses rep-entered roof assumptions and a local production model."
    return "High for pre-appointment triage because address-level PVWatts data and key roof assumptions are available."


def solar_assumptions(assumptions, source):
    return [
        f"Usable roof area entered: {assumptions.get('usableRoofAreaSqft') or 'not provided'} sq ft.",
        f"Primary solar roof direction: {assumptions.get('roofOrientation', 'unknown')}.",
        f"Roof pitch assumption: {assumptions.get('roofPitchDegrees') or 20} degrees.",
        f"Panel wattage assumption: {assumptions.get('panelWattage') or 410} W.",
        f"Shade assumption: {assumptions.get('shadeLevel', 'unknown')}.",
        "Production estimate uses NREL PVWatts with address coordinates."
        if source == "nrel-pvwatts"
        else "Production estimate uses a local fallback model until NREL PVWatts is configured or address geocoding succeeds.",
    ]


def solar_warnings(details, assumptions, geocode, source):
    warnings = []
    if not str(details.get("propertyAddress", "")).strip():
        warnings.append("Add a property address to enable address-level solar data.")
    if geocode.get("status") != "matched":
        warnings.append(geocode.get("message") or "Address coordinates were not available.")
    if source == "local-assumption":
        warnings.append("NREL PVWatts is not active for this estimate; production is approximate.")
    if not assumptions.get("usableRoofAreaSqft"):
        warnings.append("Usable roof area is missing, so system size and production cannot be estimated.")
    if assumptions.get("roofOrientation") == "unknown":
        warnings.append("Roof direction is unknown; ask the rep to confirm the primary solar-facing plane.")
    if assumptions.get("shadeLevel") == "unknown":
        warnings.append("Shade has not been confirmed from site conditions.")
    if assumptions.get("roofOrientation") == "north":
        warnings.append("North-facing roof planes usually reduce solar production.")
    if assumptions.get("shadeLevel") == "heavy":
        warnings.append("Heavy shade may materially reduce production and should be reviewed on site.")
    return warnings


def sanitize_file_name(file_name):
    clean = re.sub(r"[^a-zA-Z0-9._-]+", "-", file_name).strip(".-")
    return clean[:120] or "roof-photo.jpg"


def safe_id(value):
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-zA-Z0-9._:-]+", "-", value)[:120]


def safe_company_id(value):
    return re.sub(r"[^a-zA-Z0-9._:-]+", "-", str(value))[:80] or "company"


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def clamp_float(value, minimum, maximum, fallback):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, numeric))


def to_jsonable(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    return value
