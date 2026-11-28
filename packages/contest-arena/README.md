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

Native balloon management uses a shared, versioned page with 16 preset colors,
custom color/name drafts, per-problem previews, class/name search, status/problem
filters, pagination and batch delivery/undo. Cancelled color dialogs do not
change saved settings. Pausing generation retains colors and delivery history.
The arena jury preview, scoreboard, live feed and Resolver share normalized
problem colors. Delivery is atomic and idempotent; the first courier and time
survive repeated clicks, and legacy boolean delivery markers remain readable.
Rejudged non-AC and cancelled registrations are withdrawn from the pending queue.
First blood waits for earlier pending submissions through their normal final
callbacks rather than blocking the completed judgement in a database polling loop.
Onsite balloon eligibility follows the submission timestamp: a pre-freeze
submission judged later still earns its balloon, while out-of-window records
cannot create balloons or steal first blood. Visible CE-only scoreboard cells
remain empty; hidden compilation results remain pending until unfreezing.

Each contest can use WxPusher Simple Push with ordered, individually pausable
balloon couriers. The administrator saves each courier's OJ account and personal
SPT, plus the OJ origin that their phones can reach. Only new balloon tasks after
enabling notifications are assigned automatically; existing pending tasks can
be assigned explicitly. Durable Mongo reservations advance the round-robin cursor
once per unique task, including across concurrent AC callbacks and interrupted
inserts. Retries keep the same courier and link, while transfer/resend rotates
the task credential without advancing the cursor. Provider acceptance is separate
from physical delivery and is not a read receipt.
When a withdrawn submission is restored to AC, an unfinished notification can
resume with its original courier and a new link, without consuming another turn.
An administrator's explicit delivery undo is not automatically reversed.

Notification links open a standalone phone page without an OJ login. The random
credential travels in the URL fragment, is removed from the address bar and is
sent only in a task-specific request header. Viewing the link never marks delivery;
an explicit POST confirms only that task, using the assigned courier identity.
Links expire two hours after the contest ends, and withdrawal, transfer, resend
or delivery undo invalidates the appropriate old link. Native and phone delivery
share the same atomic operation, retaining the first sender and timestamp.

Participant management stores an optional classroom and textual seat number per
contest registration, for individuals or teams. Locations can be entered while
adding accounts or edited later. The unstyled Excel template has class, name,
classroom and seat columns. Legacy two-column imports preserve existing locations;
the four-column template explicitly updates them, including clearing blank cells.
Distinct seating rows for a class-name pair remain separate during duplicate-account
review; conflicting assignments to the same account are rejected before confirming.
Balloon management, courier notifications and the login-free phone task all use
the current location from the original participant's contest status. Public
scoreboards and ICPC feeds do not publish classroom or seat metadata.
Changing the contest end time also synchronizes existing task deadlines, including
when notifications are paused. Extending the contest does not restore an expired
or revoked credential; an administrator can explicitly resend a fresh link.
SPTs and retryable task credentials are encrypted with a persistent server key
ring; management responses never return them. The delivery page uses no external
assets, login navigation or referrer data. Disabling pushes stops new sends while
still allowing valid outstanding links to be confirmed. The push adapter's tests
use an injected transport and never send synthetic messages to real recipients.

The jury Submissions page has contest-scoped team/problem/language/verdict
filters, queued/running views, testcase verdict badges, pagination and live
updates. Jury and participant scoreboards link problem headings to statements;
jury cells also open authorized submission details. Submission confirmation uses
a nonblocking dialog, so the contest clock and progress continue while it is open.
Contest descriptions may be left blank in the ordinary contest editor.

Jury broadcasts and private jury replies produce unread alerts across the team
interface, independently of desktop notification permission. Opening a message
or marking messages read acknowledges them in the session. Desktop notification
opt-in is retained per account/contest, with explicit permission errors and
deduplicated message notifications, including polling while the tab is hidden.

Server-side scope checks bind all pages to domain/contest/participant identity.
Public and jury scoreboards use separate projections. In-contest submission
details do not expose testcase feedback. New state-changing arena forms require
a session-bound CSRF token; native submission/rejudging use Hydro's existing
permission-checked handlers.
Onsite history, source access and downloads retain the original participant's
journal ownership when accounts change teams. New private clarifications also
record their participant identity, preventing old conversations and jury replies
from appearing in a replacement team. Legacy untagged clarifications remain
visible to their original author and jury, without guessing an old roster.

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
The file-pdf glyph is from Font Awesome Free 6.7.2, Copyright 2024 Fonticons,
Inc., embedded as an SVG symbol under CC BY 4.0:
https://fontawesome.com/license/free and https://creativecommons.org/licenses/by/4.0/.
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
default, with Hydro's source download retained. Upload the statement PDF to the
problem's additional files and click `设为现场赛题面`; filenames need not change.
The selected file takes priority over legacy single-PDF/`statement.pdf` detection.
Renaming preserves the selection; deleting or explicitly clearing it never
silently switches to another attachment. Statement and
scoreboard problem links open it inline in a separate tab through Hydro's
contest-scoped file access checks, including referenced problems. The selected
PDF is omitted from the redundant attachment buttons. Without an unambiguous
PDF, the existing Hydro statement remains available. Onsite contest management
also offers `设为比赛总题面` on PDFs in its private materials. Selecting one adds
a separate `problemset` button with a PDF icon next to the Problemset page heading,
matching DOMjudge's combined booklet control. Its route
enforces the same start time, registration and jury checks as the problem list;
the uploaded PDF is opened inline in a new tab. Public materials cannot be
selected as the combined statement. No PDF conversion or merging is used.
PDF responses stream through stable contest URLs rather than redirecting to
expiring storage links. Individual PDFs use `/arena/problems/:pid/statement`,
and the combined PDF uses `/arena/statement`. The older `problem?pid=` entry
continues to serve a selected PDF directly. Content-Disposition includes a
UTF-8 filename and an ASCII fallback; the source PDF bytes remain unchanged.
Private clarification threads support participant follow-ups with Markdown
preview, without treating a participant message as a jury answer. The jury's
native OJ clarification page preserves the real author of each reply.
Jury requests, balloons, submission results and unfreeze controls refresh in
place. Clarification details also follow new replies, while automatic refresh
preserves any message or jury reply currently being drafted.

All contest rules share the participant-management screen. Its unstyled XLSX
template contains only the first-row headers `班级`, `姓名`, `教室` and `座位号`.
Legacy two-column templates remain supported without changing locations. Imports match
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

Contest administrators can open `实时展示` in contest management or the arena
jury page. Onsite contest creation or conversion automatically prepares a
read-only, contest-scoped Contest API credential; existing contests initialize
it on first access. Opening the management page immediately shows reusable
connection details and startup downloads, without a generation step.
Passwords are stored with AES-256-GCM, a dedicated persistent server key ring
and authenticated contest/generation scope. Refreshing or
using another administrator session does not change a connection. Legacy
hash-only credentials retain their existing client passwords and event generation
until an explicit reset. The downloadable Windows startup package connects the official
ICPC Tools Presentation Client directly to that API. It offers scoreboard,
submission queue, clock, and a rotation of those views with the problem summary.
Use the official Presentation Client package containing `lib/presentations.jar`
and a compatible 64-bit Java runtime. The launcher checks the tool's actual Java
requirement, selects a Chinese-capable Windows font, and gives each process its
own temporary cache so simultaneous displays do not corrupt ICPC Tools' feed cache.

The public feed follows Hydro records and registered team journals. Native onsite
whole-minute scoring, classes, names, school-logo fallback, unranked teams, and
freeze/unfreeze rules apply to both the OJ and the presentation. Rejudges retract
the previous judgement before publishing the replacement. Pending submissions
remain queued without an invented judge-start timestamp. Source code, test data,
student numbers, email addresses and native login tokens are never exported.

Scoreboard avatars initially show the local school logo; custom avatars replace
it asynchronously when available, with bounded loading and shared per-page requests.

Event tokens resume immutable, Mongo-backed batches, including after an OJ
restart. New connections receive the current public checkpoint; resuming an old
checkpoint also filters verdicts that are now hidden by a freeze or rejudge.
Clock, freeze, thaw and roster transitions stream as ordinary deltas, preserving
the official client's live model. Rewriting contest times or the freeze cutoff
invalidates earlier cursors. Credential reset or disable revokes old connections;
regenerate the startup package after a reset. The API neither accepts contest
writes nor changes standings, RP or the source contest's freeze state.

Run `yarn test:arena` for the arena's tests. The journal's restart, interrupted
commit, fencing and concurrency test additionally runs when
`HGNU_ARENA_TEST_MONGO` points to a disposable Mongo database. It creates and drops
only its own randomly named test collections.
