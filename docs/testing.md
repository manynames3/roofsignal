# Testing And Validation

The repository has deterministic frontend/domain tests, mocked backend boundary tests and configuration validation. It does not contain a deployed-AWS integration suite or automated browser end-to-end suite. Passing tests prove the exercised cases, not a production security certification or cloud rollout.

## Commands

From the repository root, using Node.js 22.12+, Python and Terraform:

```bash
npm ci
npm test
npm run typecheck
npm run build
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m unittest discover -s backend/tests -v
terraform -chdir=infra/aws fmt -check -recursive
terraform -chdir=infra/aws init -backend=false -input=false
terraform -chdir=infra/aws validate
git diff --check
```

Terraform validation installs providers but neither contacts a target account for a plan nor provisions resources. The backend tests replace boto3 clients/tables and provider responses; no AWS credentials or live provider keys are required. `boto3` is a development test dependency and is supplied by the Lambda Python runtime in deployment.

## Coverage Boundaries

| Suite                  | Evidence                                                                                                                                              | What remains unproved                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Readiness rules        | `src/lib/roofReadiness.test.ts`: risk precedence, confirmed evidence, sample scenarios                                                                | Professional inspection accuracy or a benchmark against field outcomes                        |
| Solar estimates        | `src/lib/solarOpportunity.test.ts`: assumptions, roof sizing, sample production                                                                       | Live PVWatts/Census behavior or Python/TypeScript parity                                      |
| AWS client             | `src/lib/awsBackend.test.ts`: no default-admin role, signed multipart POST fields, file ordering and rejected upload                                  | Live JWT verification, S3 enforcement, CORS and actual signature validity                     |
| CSV                    | `src/lib/csv.test.ts` and backend tests: formula-prefix neutralization / escaping                                                                     | Every spreadsheet/importer's behavior                                                         |
| Demo provider boundary | `functions/_shared/geminiPhotoEvidence.test.mjs`: disabled default, origin/body/type constraints, normalized output, private errors                   | Authentication, distributed abuse prevention or real model accuracy                           |
| Backend API            | `backend/tests/test_app.py`: claims, tenant keys, owner/admin actions, expiry, share projection, payload limits, deletion isolation, safe logs/errors | AWS IAM, service consistency, live JWT verification, concurrency/load, backups and deployment |
| Build / IaC            | TypeScript build and Terraform fmt/init/validate                                                                                                      | Browser accessibility/performance or a real account plan                                      |

The [GitHub Actions workflow](../.github/workflows/validate.yml) runs frontend tests/typechecked build, Python tests and Terraform checks without cloud credentials. No passing badge is claimed before a hosted workflow run. There is no separate ESLint configuration, Docker build, Checkov/TFLint or secret-scanning job.

## Browser Smoke Procedure

Inspect the running app at desktop and phone widths. Open `/`, `/app`, `/app?blank=1` and a sample scenario link. Check mobile navigation, loaded photos, report/job/workspace tabs, keyboard focus, form labels and reduced motion. Edit an input: the old report must show a stale warning and disable export/share/print until regenerated. Save/load/delete local reports and inspect the empty state. Print should omit navigation and the internal rep briefing. An unavailable `?share=` link must never show a sample report as a shared customer report.

Screenshots, when included, must come from the running app with fictional demo data and be labeled as local captures. They do not prove the latest source is live. Hosted release smoke steps, including two-company authorization and actual S3 uploads, are in [deployment](deployment.md); execute them in a disposable environment before broader hosted use.

## Local Validation Record

Checked on 2026-10-13 against the uncommitted working tree:

- Frontend: 42 tests passed; typechecked production build passed.
- Backend: 46 mocked tests passed using Python 3.14.6 locally. CI targets the Lambda Python 3.12 runtime; that CI run is not yet verified.
- Infrastructure: Terraform fmt and validate passed after credential-free initialization. No AWS plan or apply was performed.
- Dependencies: `npm audit --omit=dev` reported zero known vulnerabilities. This is a point-in-time registry check, not a security certification.
- Documentation: Markdown formatting and 70 local links/anchors passed; changed text had no detected credential patterns or restricted artifacts. `git diff --check` passed.
- Browser: inspected desktop (1440px), phone (390px) and narrow phone (320px). Checked navigation, loaded sample photos, local save/reload/delete, preserved solar inputs and tags, missing local-image placeholders, sample exclusion from business metrics, disabled stale exports, print redaction, reduced motion and unavailable share links.
- Delayed generation/AI responses and rejected AI captions were checked with controlled provider responses in the local browser. These checks do not prove live Census, Gemini or AWS integrations.

[Landing](images/landing-desktop.png) and [report](images/report-desktop.png) screenshots are real local captures with fictional sample details. No hosted workflow, cloud deployment, alert delivery or recovery exercise is asserted by this record.
