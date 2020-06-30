/* eslint-disable func-names */
const { isClass } = require('./utils');

const Err = (name, ...classMessageCode) => {
    let Class;
    let msg;
    let code;
    for (const item of classMessageCode) {
        if (typeof item === 'number') {
            code = item;
        } else if (typeof item === 'string') {
            msg = function () { return item; };
        } else if (isClass(item)) {
            Class = item;
        } else if (typeof item === 'function') {
            msg = item;
        }
    }
    const HydroError = class extends Class { };
    HydroError.prototype.name = name;
    if (msg) HydroError.prototype.msg = msg;
    if (code) HydroError.prototype.code = code;
    return HydroError;
};

class HydroError extends Error {
    constructor(...params) {
        super();
        this.params = params;
    }
}

const UserFacingError = Err('UserFacingError', HydroError, 'UserFacingError', 400);
const SystemError = Err('SystemError', HydroError, 'SystemError', 500);

const BadRequestError = Err('BadRequestError', UserFacingError, 400);
const ForbiddenError = Err('ForbiddenError', UserFacingError, 403);
const NotFoundError = Err('NotFoundError', UserFacingError, 404);
const RemoteOnlineJudgeError = Err('RemoteOnlineJudgeError', UserFacingError, 500);

const AlreadyVotedError = Err('AlreadyVotedError', ForbiddenError, "You've already voted.");
const LoginError = Err('LoginError', ForbiddenError, 'Invalid password for user {0}.');
const UserAlreadyExistError = Err('UserAlreadyExistError', ForbiddenError, 'User {0} already exists.');
const InvalidTokenError = Err('InvalidTokenError', ForbiddenError);
const BlacklistedError = Err('BlacklistedError', ForbiddenError, 'Address or user {0} is blacklisted.');
const VerifyPasswordError = Err('VerifyPasswordError', ForbiddenError, "Passwords don't match.");
const OpcountExceededError = Err('OpcountExceededError', ForbiddenError, 'Too frequent operations of {0} (limit: {2} operations in {1} seconds).');
const PermissionError = Err('PermissionError', ForbiddenError, "You don't have the required permission ({0}) in this domain.");
const PrivilegeError = Err('PrivilegeError', ForbiddenError, function () {
    if (this.params.includes(global.Hydro.model.builtin.PRIV.PRIV_USER_PROFILE)) {
        return "You're not logged in.";
    }
    return "You don't have the required privilege.";
});
const ValidationError = Err('ValidationError', ForbiddenError, function () {
    if (this.params.length === 1) return 'Field {0} validation failed.';
    return 'Field {0} or {1} validation failed.';
});
const ContestNotAttendedError = Err('ContestNotAttendedError', ForbiddenError, "You haven't attended this contest yet.");
const ContestAlreadyAttendedError = Err('ContestAlreadyAttendedError', ForbiddenError, "You've already attended this contest.");
const ContestNotLiveError = Err('ContestNotLiveError', ForbiddenError, 'This contest is not live.');
const ContestScoreboardHiddenError = Err('ContestScoreboardHiddenError', ForbiddenError, 'Contest scoreboard is not visible.');
const TrainingAlreadyEnrollError = Err('TrainingAlreadyEnrollError', ForbiddenError, "You've already enrolled this training.");
const RoleAlreadyExistError = Err('RoleAlreadyExistError', ForbiddenError, 'This role already exists.');
const CsrfTokenError = Err('CsrfTokenError', ForbiddenError);

const UserNotFoundError = Err('UserNotFoundError', NotFoundError, 'User {0} not found.');
const NoProblemError = Err('NoProblemError', NotFoundError, 'No problem.');
const RecordNotFoundError = Err('RecordNotFoundError', NotFoundError, 'Record {0} not found.');
const ProblemDataNotFoundError = Err('ProblemDataNotFoundError', NotFoundError, 'Data of problem {1} not found.');
const MessageNotFoundError = Err('MessageNotFoundError', NotFoundError, 'Message {0} not found.');
const DocumentNotFoundError = Err('DocumentNotFoundError', NotFoundError, 'Document {2} not found.');

const ProblemNotFoundError = Err('ProblemNotFountError', DocumentNotFoundError, 'Problem {1} not found.');
const SolutionNotFoundError = Err('SolutionNotFoundError', DocumentNotFoundError);
const TrainingNotFoundError = Err('TrainingNotFoundError', DocumentNotFoundError);
const ContestNotFoundError = Err('ContestNotFoundError', DocumentNotFoundError);
const DiscussionNotFoundError = Err('DiscussionNotFoundError', DocumentNotFoundError, 'Discussion {0} not found.');
const DiscussionNodeNotFoundError = Err('DiscussionNodeNotFoundError', DocumentNotFoundError, 'Discussion node {1} not found.');

global.Hydro.error = module.exports = {
    Err,
    HydroError,
    BadRequestError,
    BlacklistedError,
    ForbiddenError,
    NotFoundError,
    LoginError,
    CsrfTokenError,
    UserAlreadyExistError,
    InvalidTokenError,
    UserNotFoundError,
    VerifyPasswordError,
    ProblemDataNotFoundError,
    OpcountExceededError,
    PermissionError,
    PrivilegeError,
    NoProblemError,
    ValidationError,
    ProblemNotFoundError,
    TrainingNotFoundError,
    ContestNotFoundError,
    RecordNotFoundError,
    SolutionNotFoundError,
    AlreadyVotedError,
    ContestNotAttendedError,
    ContestNotLiveError,
    ContestScoreboardHiddenError,
    ContestAlreadyAttendedError,
    UserFacingError,
    SystemError,
    TrainingAlreadyEnrollError,
    RemoteOnlineJudgeError,
    DiscussionNodeNotFoundError,
    DocumentNotFoundError,
    DiscussionNotFoundError,
    RoleAlreadyExistError,
    MessageNotFoundError,
};

/*
class FileTooLongError(ValidationError):
  @property
  def message(self):
    return 'The uploaded file is too long.'

class FileTypeNotAllowedError(ValidationError):
  @property
  def message(self):
    return 'This type of files are not allowed to be uploaded.'

class InvalidOperationError(ForbiddenError):
  pass

class InvalidTokenDigestError(ForbiddenError):
  pass

class CurrentPasswordError(ForbiddenError):
  @property
  def message(self):
    return "Current password doesn't match."

class DiscussionCategoryAlreadyExistError(ForbiddenError):
  @property
  def message(self):
    return 'Discussion category {1} already exists.'

class DiscussionCategoryNotFoundError(NotFoundError):
  @property
  def message(self):
    return 'Discussion category {1} not found.'

class DiscussionNodeAlreadyExistError(ForbiddenError):
  @property
  def message(self):
    return 'Discussion node {1} already exists.'

class TrainingRequirementNotSatisfiedError(ForbiddenError):
  @property
  def message(self):
    return 'Training requirement is not satisfied.'

class UsageExceededError(ForbiddenError):
  @property
  def message(self):
    return 'Usage exceeded.'

class InvalidArgumentError(BadRequestError):
  @property
  def message(self):
    return 'Argument {0} is invalid.'

class SendMailError(UserFacingError):
  @property
  def message(self):
    return 'Failed to send mail to {0}.'
*/
