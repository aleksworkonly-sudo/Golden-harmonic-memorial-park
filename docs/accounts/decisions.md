# Account decisions

Confirmed November 26, 2026 (Asia/Manila), user answers in implementation chat:

- D1: Only payments verified after launch trigger invitations. No historical invitation campaign.
- D2: Account required for future payments after the first qualifying post-launch payment. Retain guest history, setup recovery and correction of already-submitted evidence. A pre-launch buyer's next posted payment establishes eligibility; do not retroactively lock all historical buyers out without onboarding.
- D3: Any positive verified principal credit qualifies, including partial deposits.
- Email/password login, buyer's own email, invitation after verification remain confirmed.
- Local implementation authorized. Live configuration, emails, migrations and deployment are not performed by this implementation.

Operational launch requires an explicit server-side launch timestamp and feature flags. Payments verified before it must not trigger invitations.
