# Cost Model

No measured monthly bill, traffic level, savings or free-tier guarantee is available. Costs depend on region, actual usage, retention, provider pricing and account eligibility. This is a driver model, not a quote.

| Driver           | Usage input                                    | Existing control                                                                           |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Cloudflare Pages | Builds, asset transfer, function requests      | Static frontend; demo provider endpoint off by default                                     |
| API Gateway      | Requests / transferred bytes                   | 15 requests/sec steady, 30 burst in stage settings                                         |
| Lambda           | Invocations x billed duration x memory         | 512 MB, 25-second timeout, reserved concurrency default 5                                  |
| DynamoDB         | Read/write units, stored JSON                  | On-demand billing; report/share/usage TTL; bounded report payload                          |
| S3               | Photo GB-month, upload/read requests, transfer | 12-MB signed upload ceiling; default 90-day lifecycle; reviewed bucket cleanup at teardown |
| Cognito          | Active accounts / applicable features          | Invitations only; no claimed free usage                                                    |
| SSM              | Parameters and API reads                       | Two keys, runtime cache; no per-request fetch after warm cache                             |
| CloudWatch       | Log ingestion/storage, alarms                  | 14-day log retention, metadata-only records                                                |
| Gemini / NREL    | Provider calls and billable input/output       | Per-company daily counters: Gemini 100, NREL 300 defaults; provider timeouts               |

Provider limits count attempted requests, not successful reports or exact token/image costs. Invalid/provider-failed calls can consume quota. Concurrency and throttles reduce simultaneous load but do not cap total monthly cost. Multiple companies multiply the per-company quota. Public access/share traffic can incur charges without authenticated users.

## Operator Budget

Estimate: expected companies x requests/company/day x days, photo uploads x average size x retention, report sizes x retained count, and provider input/output. Use current provider/AWS account pricing before applying; do not infer a fixed price from defaults. Monitor actual account billing and usage before raising limits.

AWS Budgets/Cost Anomaly Detection, budget alerts and cost allocation dashboards are not provisioned. Terraform tags resources with app/management labels; account billing tag activation is separate. No ECS, EKS, RDS, ALB, NAT gateway or always-on application VM exists in this stack.

## Idle And Cleanup

An idle Lambda/API generally has no invocation load, but stored reports/photos/logs and alarms can still cost money. TTL and lifecycle are asynchronous; orphan uploads can remain until lifecycle expiration. [Teardown](teardown.md) removes AWS resources after reviewed data disposal; Cloudflare and browser storage require separate cleanup.
