# HGNUOJ contest arena

An optional DOMjudge 9-style team interface backed by Hydro's existing accounts,
submissions, judging, contest journals, clarifications and balloons.
This package does not run DOMjudge or maintain a second competition database.

Select `现场赛` in the ordinary Hydro contest editor. The only additional
configuration is the number of gold, silver and bronze medals; zero disables
that medal band. No separate arena settings page is used.

The new rule uses whole elapsed minutes, 20-minute incorrect submission penalties,
no CE penalty, first AC, inclusive freeze boundaries and last-AC tie breaking.
Its scorer feeds both the native Hydro scoreboard and the arena. Existing ACM
competitions retain their original scoring. Personal RP follows the configured
native rating process and the contest editor's Rated toggle. The homepage and
contest list show Rated only when that toggle is enabled. The addon's versioned
native-list stylesheet provides the onsite rule badge without rebuilding the
unrelated native frontend bundles.

The interface includes Home, Problemset, source-file Submit, submission details,
Scoreboard, Languages, clarification requests/replies, jury broadcasts, balloon
delivery state and rejudging. Printing is not offered in the onsite interface;
the former arena print route and native onsite printing APIs reject requests,
including contests with a legacy `allowPrint` flag. Scoreboard print controls
are omitted too.

Server-side scope checks bind all pages to domain/contest/participant identity.
Public and jury scoreboards use separate projections. In-contest submission
details do not expose testcase feedback. New state-changing arena forms require
a session-bound CSRF token; native submission/rejudging use Hydro's existing
permission-checked handlers.

Submission history is paginated in sets of 50, with the full team history
available. Submission dialogs follow each problem's language restrictions;
time and memory labels come from Hydro's parsed testcase configuration.
Pages opened before the contest automatically reload when it starts. Native
record pages and arena pages both hide testcase details during the contest.
Open pages also reload at the global contest end or when an administrator
ends/resumes an individual participant. A personal early end disables that
participant's submissions; it does not unlock public post-contest features.
Statements are public after the global end. Before the start, jury statement
and attachment previews are read-only and do not authorize early submissions.

Reference: https://www.domjudge.org/docs/manual/9.0/team.html

The scoreboard follows DOMjudge 9's public/team distinction: compact grid,
coloured problem badges, solve time above submission count, account avatars,
configured medals, favourite teams pinned above the original standings,
class/category/name filters, summary and colour legend, fixed headings,
mobile rows and a print layout. Rows use the corresponding OJ account's
avatar, name and class; missing or failed avatars use the existing HGNU logo.
Contest status is derived automatically from start, end and freeze times.
Favourite and filter controls do not change the overall ranks or contest data.

Ordinary ACM contests retain Hydro's second-precision scoring. The arena's
new ICPC rule truncates each solve time to whole minutes before summing. The
scoreboard and RP computation share that rule; changing appearance does not
silently re-score historical contests. Only the onsite rule exposes arena pages;
legacy `arenaEnabled` flags on ACM contests no longer enable an arena preview.
An explicit rule conversion requires recalculating the stored contest statuses
from their existing journals with Hydro's `recalcStatus` API.
The ordinary editor saves scoring and freeze options together before this
recalculation. Invalid onsite freeze times are rejected. Native HTML/CSV exports
follow the same unfreeze state as the displayed scoreboard. Non-ranking onsite
entries are excluded from the ranking input used for personal RP.
Personal RP waits for the onsite contest to finish, be unfrozen and have no
pending/unknown judgements. Empty and unofficial-only onsite contests are
skipped before selecting the ten most recent eligible rated contests. Other
contest rules retain their existing selection policy and rating formula.
RP and Resolver exports also compare the journals against current record
metadata, so a queued rejudge or an unsynchronized final verdict cannot be
published as a finalized snapshot. Cancelled-entry history remains archived
when an account later registers as a different entry.

Visual and interaction references are DOMjudge 9.0.0's scoreboard templates,
style_domjudge.css and domjudge.js:
https://github.com/DOMjudge/domjudge/tree/9.0.0/webapp
DOMjudge is copyright its contributors; see its COPYING for licensing.
The HGNU affiliation logo is the existing public logo from the original contest.

The layout and interactions follow DOMjudge's team workflow. HGNUOJ's judge is
still Hydro; compiler and sandbox behavior is not claimed identical to DOMjudge.

Only the `icpc_domjudge` rule enables account-level contest mode. Participant
management reserves each real account for one onsite contest; the restriction
begins exactly twenty minutes before its start and expires automatically at
the global contest end. An administrator can release it early. Contest owners, domain contest
administrators and system administrators are exempt. Other rules never expose
onsite pages or restrict account navigation.
The restriction is enforced before HTTP handlers and native WebSocket handlers,
so opening another OJ tab or submitting the logout endpoint cannot bypass it.
Already-open pages also watch the server's activation deadline without requiring
a click or refresh. The watcher is included in the common HTML layout, immersive
pages and standalone arenas. Canonical and native paths within the correct arena
are retained, while another arena redirects to the assigned contest. Returning
to a tab or recovering a connection rechecks immediately. The waiting screen uses
the real team/display name even while its scoreboard row is hidden before start.

The waiting page, two-column home screen and blue overview headings, problem
and language card grids, compact submission/clarification tables, and large
submission/clarification dialogs follow the installed DOMjudge 9.0.0 team
templates. Submission times retain seconds. Source viewing is collapsed by
default, with Hydro's source download retained. Problem statements remain
Hydro Markdown and attachments; no nonexistent PDF or sample ZIP is advertised.
Private clarification threads support participant follow-ups with Markdown
preview, without treating a participant message as a jury answer. The jury's
native OJ clarification page preserves the real author of each reply.
Jury requests, balloons, submission results and unfreeze controls refresh in
place. Clarification details also follow new replies, while automatic refresh
preserves any message or jury reply currently being drafted.

All contest rules share the participant-management screen. Its unstyled XLSX
template contains only the first-row headers `班级` and `姓名`. Imports match
both fields exactly after trimming outer whitespace. Unambiguous rows import
immediately; missing rows are reported, and duplicate identities require an
explicit selection of one, several or all candidate accounts. Duplicate choices
are bound to the administrator, contest and session token and expire after
twenty minutes. Batch cancellation preserves submitted code and score journals
while excluding cancelled registrations from scoreboards; reenrolment restores
the existing journal. Releasing onsite contest mode leaves registration intact.
An onsite team with previous submissions can reenrol only with its original
member set. A changed roster must use a new team; rejudging old submissions
continues to update their historical entry, including after cancellation.
Changing a registered ordinary contest to the onsite rule also materializes
account restrictions; conflicting onsite registrations prevent conversion.
Releasing navigation restrictions does not permit registering that same account
as another entry in the same onsite contest. Cancel the old registration first.
Conversions validate existing members and reject duplicate real participants.
Missing bindings recover from active registration records on the next request,
while explicit releases remain effective. Cached pages resume polling when
restored through browser Back/Forward or when their connection recovers.
Jury source downloads and native record updates use the same contest-scoped
access as the arena. Rejudge controls still require Hydro's rejudge permission.

After an onsite contest ends, its jury page and native scoreboard expose
`导出 ICPC 滚榜包` to contest administrators. The package contains a finalized
ICPC Contest API 2026-01 event feed, matching whole-minute scoring and medals,
local account images, class captions and a usage guide. Exports are read-only:
neither downloading nor resolving changes the source contest, RP or its public
freeze state. If the contest never froze, the export uses a replay-only freeze
duration of 60 minutes, bounded by the contest duration.
Pending judgements block export instead of being silently finalized. Cancelled
registrations and non-scoring judgements are excluded; unofficial teams remain
in the archive as hidden teams and do not affect Resolver's official ranks.
All three medal definitions are explicit, even when a band has zero recipients,
so Resolver cannot replace the configured counts with default awards. After
the ceremony an administrator can use the existing scoreboard-unfreeze action.
Resolver display names use `class-name`. The exported Windows launcher sets
`ICPC_FONT=Microsoft YaHei` only for its own process, because the tool's bundled
Helvetica font lacks Chinese glyphs. The launch guide also documents suitable
Linux/macOS font overrides; the installed font must support the contest's text.
The Windows package includes a PowerShell helper that reads the Resolver's Java
requirement, skips incompatible runtimes, and searches packaged runtimes,
environment variables, PATH and common JDK installation directories. A portable
JDK/JRE can be placed in `runtime/`, or selected with `-JavaHome`. No machine-wide
Java or font settings are changed. `-Check` verifies the selected runtime without
opening the presentation.
