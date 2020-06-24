const perm = {
    PERM_MANAGE: '#',
    PERM_LOGGEDIN: '0',
    PERM_MOD_BADGE: '3',
    PERM_CREATE_PROBLEM: '5',
    PERM_EDIT_PROBLEM: '6',
    PERM_VIEW_PROBLEM: '7',
    PERM_VIEW_PROBLEM_HIDDEN: '8',
    PERM_SUBMIT_PROBLEM: '9',
    PERM_READ_PROBLEM_DATA: 'A',
    PERM_READ_RECORD_CODE: 'B',
    PERM_REJUDGE_PROBLEM: 'C',
    PERM_REJUDGE: 'D',
    PERM_VIEW_PROBLEM_SOLUTION: 'E',
    PERM_CREATE_PROBLEM_SOLUTION: 'F',
    PERM_VOTE_PROBLEM_SOLUTION: 'G',
    PERM_EDIT_PROBLEM_SOLUTION: 'H',
    PERM_DELETE_PROBLEM_SOLUTION: 'I',
    PERM_REPLY_PROBLEM_SOLUTION: 'J',
    PERM_EDIT_PROBLEM_SOLUTION_REPLY: 'K',
    PERM_DELETE_PROBLEM_SOLUTION_REPLY: 'L',
    PERM_VIEW_DISCUSSION: 'M',
    PERM_CREATE_DISCUSSION: 'N',
    PERM_HIGHLIGHT_DISCUSSION: 'O',
    PERM_EDIT_DISCUSSION: 'P',
    PERM_DELETE_DISCUSSION: 'Q',
    PERM_REPLY_DISCUSSION: 'R',
    PERM_EDIT_DISCUSSION_REPLY: 'S',
    PERM_DELETE_DISCUSSION_REPLY: 'T',
    PERM_VIEW_CONTEST: 'U',
    PERM_VIEW_CONTEST_SCOREBOARD: 'V',
    PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD: 'W',
    PERM_CREATE_CONTEST: 'X',
    PERM_ATTEND_CONTEST: 'Y',
    PERM_EDIT_CONTEST: 'Z',
    PERM_VIEW_TRAINING: 'a',
    PERM_CREATE_TRAINING: 'b',
    PERM_EDIT_TRAINING: 'c',
    PERM_VIEW_HOMEWORK: 'e',
    PERM_CREATE_HOMEWORK: 'f',
    PERM_EDIT_HOMEWORK: 'g',
    PERM_ATTEND_HOMEWORK: 'h',
    PERM_VIEW_HOMEWORK_SCOREBOARD: 'i',
    PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD: 'j',
    PERM_JUDGE: 'd',
};

let PERM_ALL = '';
for (const p in perm) PERM_ALL += perm[p];
perm.PERM_ALL = PERM_ALL;

const Permission = (family, key, desc) => ({ family, key, desc });

const PERMS = [
    Permission('perm_general', perm.PERM_MANAGE, 'Manage domain'),
    Permission('perm_general', perm.PERM_MOD_BADGE, 'Show MOD badge'),
    Permission('perm_problem', perm.PERM_CREATE_PROBLEM, 'Create problems'),
    Permission('perm_problem', perm.PERM_EDIT_PROBLEM, 'Edit problems'),
    Permission('perm_problem', perm.PERM_VIEW_PROBLEM, 'View problems'),
    Permission('perm_problem', perm.PERM_VIEW_PROBLEM_HIDDEN, 'View hidden problems'),
    Permission('perm_problem', perm.PERM_SUBMIT_PROBLEM, 'Submit problem'),
    Permission('perm_problem', perm.PERM_READ_PROBLEM_DATA, 'Read data of problem'),
    Permission('perm_record', perm.PERM_READ_RECORD_CODE, 'Read record codes'),
    Permission('perm_record', perm.PERM_REJUDGE_PROBLEM, 'Rejudge problems'),
    Permission('perm_record', perm.PERM_REJUDGE, 'Rejudge records'),
    Permission('perm_problem_solution', perm.PERM_VIEW_PROBLEM_SOLUTION, 'View problem solutions'),
    Permission('perm_problem_solution', perm.PERM_CREATE_PROBLEM_SOLUTION, 'Create problem solutions'),
    Permission('perm_problem_solution', perm.PERM_VOTE_PROBLEM_SOLUTION, 'Vote problem solutions'),
    Permission('perm_problem_solution', perm.PERM_EDIT_PROBLEM_SOLUTION, 'Edit problem solutions'),
    Permission('perm_problem_solution', perm.PERM_DELETE_PROBLEM_SOLUTION, 'Delete problem solutions'),
    Permission('perm_problem_solution', perm.PERM_REPLY_PROBLEM_SOLUTION, 'Reply problem solutions'),
    Permission('perm_problem_solution', perm.PERM_EDIT_PROBLEM_SOLUTION_REPLY, 'Edit problem solution replies'),
    Permission('perm_problem_solution', perm.PERM_DELETE_PROBLEM_SOLUTION_REPLY, 'Delete problem solution replies'),
    Permission('perm_discussion', perm.PERM_VIEW_DISCUSSION, 'View discussions'),
    Permission('perm_discussion', perm.PERM_CREATE_DISCUSSION, 'Create discussions'),
    Permission('perm_discussion', perm.PERM_HIGHLIGHT_DISCUSSION, 'Highlight discussions'),
    Permission('perm_discussion', perm.PERM_EDIT_DISCUSSION, 'Edit discussions'),
    Permission('perm_discussion', perm.PERM_DELETE_DISCUSSION, 'Delete discussions'),
    Permission('perm_discussion', perm.PERM_REPLY_DISCUSSION, 'Reply discussions'),
    Permission('perm_discussion', perm.PERM_EDIT_DISCUSSION_REPLY, 'Edit discussion replies'),
    Permission('perm_discussion', perm.PERM_DELETE_DISCUSSION_REPLY, 'Delete discussion replies'),
    Permission('perm_contest', perm.PERM_VIEW_CONTEST, 'View contests'),
    Permission('perm_contest', perm.PERM_VIEW_CONTEST_SCOREBOARD, 'View contest scoreboard'),
    Permission('perm_contest', perm.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD, 'View hidden contest submission status and scoreboard'),
    Permission('perm_contest', perm.PERM_CREATE_CONTEST, 'Create contests'),
    Permission('perm_contest', perm.PERM_ATTEND_CONTEST, 'Attend contests'),
    Permission('perm_contest', perm.PERM_EDIT_CONTEST, 'Edit any contests'),
    Permission('perm_homework', perm.PERM_VIEW_HOMEWORK, 'View homework'),
    Permission('perm_homework', perm.PERM_VIEW_HOMEWORK_SCOREBOARD, 'View homework scoreboard'),
    Permission('perm_homework', perm.PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD, 'View hidden homework submission status and scoreboard'),
    Permission('perm_homework', perm.PERM_CREATE_HOMEWORK, 'Create homework'),
    Permission('perm_homework', perm.PERM_ATTEND_HOMEWORK, 'Claim homework'),
    Permission('perm_homework', perm.PERM_EDIT_HOMEWORK, 'Edit any homework'),
];

const PERMS_BY_FAMILY = {};
for (const p of PERMS) {
    if (!PERMS_BY_FAMILY[p.family]) PERMS_BY_FAMILY[p.family] = [p];
    else PERMS_BY_FAMILY[p.family].push(p);
}
perm.PERMS_BY_FAMILY = PERMS_BY_FAMILY;

perm.PERM_BASIC = perm.PERM_VIEW_PROBLEM
    + perm.PERM_VIEW_PROBLEM_SOLUTION
    + perm.PERM_VIEW_DISCUSSION
    + perm.PERM_VIEW_TRAINING
    + perm.PERM_VIEW_CONTEST
    + perm.PERM_VIEW_CONTEST_SCOREBOARD
    + perm.PERM_VIEW_HOMEWORK
    + perm.PERM_VIEW_HOMEWORK_SCOREBOARD;

perm.PERM_DEFAULT = perm.PERM_BASIC
    + perm.PERM_SUBMIT_PROBLEM
    + perm.PERM_CREATE_PROBLEM_SOLUTION
    + perm.PERM_VOTE_PROBLEM_SOLUTION
    + perm.PERM_REPLY_PROBLEM_SOLUTION
    + perm.PERM_CREATE_DISCUSSION
    + perm.PERM_REPLY_DISCUSSION
    + perm.PERM_ATTEND_CONTEST
    + perm.PERM_CREATE_TRAINING
    + perm.PERM_LOGGEDIN
    + perm.PERM_ATTEND_HOMEWORK;

perm.PERM_ADMIN = perm.PERM_ALL;

perm.PRIV_NONE = 0;
perm.PRIV_ADMIN = 1;

global.Hydro.permission = module.exports = perm;
