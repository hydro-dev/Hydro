class UserFacingError extends Error {
    constructor(type) {
        super(type);
        this.code = 500;
        // this.stack = '';
        this.params = [];
    }
}

class SystemError extends Error {
    constructor(type) {
        super(type);
        this.code = 500;
        // this.stack = '';
        this.params = [];
    }
}

class BadRequestError extends UserFacingError {
    constructor(type) {
        super(type);
        this.code = 400;
    }
}

class ForbiddenError extends UserFacingError {
    constructor(type) {
        super(type);
        this.code = 403;
    }
}

class NotFoundError extends UserFacingError {
    constructor(type) {
        super(type || 'NotFoundError');
        this.code = 404;
    }
}

class RemoteOnlineJudgeError extends UserFacingError {
    constructor(message) {
        super('RemoteOnlineJudgeError');
        this.params = [message];
    }
}

class AlreadyVotedError extends BadRequestError {
    constructor(psid, uid) {
        super('You\'ve already voted.');
        this.params = [psid, uid];
    }
}

class LoginError extends ForbiddenError {
    constructor(uname) {
        super('LoginError');
        this.params = [uname];
    }
}

class UserAlreadyExistError extends ForbiddenError {
    constructor(uname) {
        super('UserAlreadyExistError');
        this.params = [uname];
    }
}

class InvalidTokenError extends ForbiddenError {
    constructor(token) {
        super('InvalidTokenError');
        this.params = [token];
    }
}

class BlacklistedError extends ForbiddenError {
    constructor(ip) {
        super('Address {0} is blacklisted.');
        this.params = [ip];
    }
}

class UserNotFoundError extends NotFoundError {
    constructor(user) {
        super('UserNotFoundError');
        this.params = [user];
    }
}

class NoProblemError extends NotFoundError {
    constructor() {
        super('NoProblemError');
    }
}

class VerifyPasswordError extends ForbiddenError {
    constructor() {
        super('VerifyPasswordError');
    }
}

class OpcountExceededError extends ForbiddenError {
    constructor(op, periodSecs, maxOperations) {
        super('OpcountExceededError');
        this.params = [op, periodSecs, maxOperations];
    }
}

class PermissionError extends ForbiddenError {
    constructor(perm) {
        super('PermissionError');
        this.params = [perm];
    }
}

class ValidationError extends ForbiddenError {
    constructor(field0, field1) {
        super('ValidationError');
        if (!field1) this.params = [field0];
        else this.params = [field0, field1];
    }
}

class ContestNotAttendedError extends ForbiddenError {
    constructor(tid) {
        super('You haven\'t attended this contest yet.');
        this.params = [tid];
    }
}

class ContestAlreadyAttendedError extends ForbiddenError {
    constructor(tid, uid) {
        super('You\'ve already attended this contest.');
        this.params = [tid, uid];
    }
}

class ContestNotLiveError extends ForbiddenError {
    constructor(tid) {
        super('This contest is not live.');
        this.params = [tid];
    }
}

class ContestScoreboardHiddenError extends ForbiddenError {
    constructor(tid) {
        super('Contest scoreboard is not visible.');
        this.params = [tid];
    }
}

class TrainingAlreadyEnrollError extends ForbiddenError {
    constructor(tid, uid) {
        super("You've already enrolled this training.");
        this.params = [tid, uid];
    }
}

class RoleAlreadyExistError extends ForbiddenError {
    constructor(role) {
        super('This role already exists.');
        this.params = [role];
    }
}

class ProblemNotFoundError extends NotFoundError {
    constructor(pid) {
        super('ProblemNotFoundError');
        this.params = [pid];
    }
}

class RecordNotFoundError extends NotFoundError {
    constructor(rid) {
        super('RecordNotFoundError');
        this.params = [rid];
    }
}

class SolutionNotFoundError extends NotFoundError {
    constructor(psid) {
        super('SolutionNotFoundError');
        this.params = [psid];
    }
}

class TrainingNotFoundError extends NotFoundError {
    constructor(tid) {
        super('TrainingNotFoundError');
        this.params = [tid];
    }
}

class ContestNotFoundError extends NotFoundError {
    constructor(cid) {
        super('ContestNotFoundError');
        this.params = [cid];
    }
}

class ProblemDataNotFoundError extends NotFoundError {
    constructor(pid) {
        super('Data of problem {0} not found.');
        this.params = [pid];
    }
}

class DiscussionNodeNotFoundError extends NotFoundError {
    constructor(type, docId) {
        super('Discussion node {0}/{1} not found.');
        this.params = [type, docId];
    }
}

class DocumentNotFoundError extends NotFoundError {
    constructor(docId) {
        super('Document {0} not found.');
        this.params = [docId];
    }
}

class DiscussionNotFoundError extends NotFoundError {
    constructor(did) {
        super('Discussion {0} not found.');
        this.params = [did];
    }
}

module.exports = {
    BadRequestError,
    BlacklistedError,
    ForbiddenError,
    NotFoundError,
    LoginError,
    UserAlreadyExistError,
    InvalidTokenError,
    UserNotFoundError,
    VerifyPasswordError,
    ProblemDataNotFoundError,
    OpcountExceededError,
    PermissionError,
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


class UnknownFieldError(ForbiddenError):
  @property
  def message(self):
    return 'Unknown field {0}.'

class CsrfTokenError(ForbiddenError):
  pass


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


class MessageNotFoundError(NotFoundError):
  @property
  def message(self):
    return 'Message {0} not found.'


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


class BatchCopyLimitExceededError(ForbiddenError):
  @property
  def message(self):
    return 'Only {0} problems can be copied in one request, got {1}.'


class UpgradeLockAcquireError(Error):
  @property
  def message(self):
    return 'Failed to acquire the upgrade lock. There may be another ongoing upgrade process, or a previous process is exited unexpectedly.'


class UpgradeLockReleaseError(Error):
  @property
  def message(self):
    return 'Failed to release the upgrade lock. The database is malformed during the upgrade.'


class DatabaseVersionMismatchError(Error):
  @property
  def message(self):
    return 'Database version mismatch, got {0}, expect {1}. You need to invoke database upgrades.'


class SendMailError(UserFacingError):
  @property
  def message(self):
    return 'Failed to send mail to {0}.'
*/
