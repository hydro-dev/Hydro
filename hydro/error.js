class UserFacingError extends Error {
    constructor(type) {
        super(type);
        this.code = 500;
        //this.stack = '';
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
    constructor(op, period_secs, max_operations) {
        super('OpcountExceededError');
        this.params = [op, period_secs, max_operations];
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
module.exports = {
    BadRequestError, ForbiddenError, NotFoundError,
    LoginError, UserAlreadyExistError, InvalidTokenError,
    UserNotFoundError, VerifyPasswordError, ProblemDataNotFoundError,
    OpcountExceededError, PermissionError, NoProblemError,
    ValidationError, ProblemNotFoundError, TrainingNotFoundError,
    ContestNotFoundError, RecordNotFoundError
};

/*
from vj4.model import builtin


class Error(Exception):
  pass


class HashError(Error):
  pass


class InvalidStateError(Error):
  pass


class UserFacingError(Error):
  """Error which faces end user."""

  def to_dict(self):
    return {'name': self.__class__.__name__, 'args': self.args}

  @property
  def http_status(self):
    return 500

  @property
  def template_name(self):
    return 'error.html'

  @property
  def message(self):
    return 'An error has occurred.'



class BlacklistedError(ForbiddenError):
  @property
  def message(self):
    return 'Address {0} is blacklisted.'


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


class DocumentNotFoundError(NotFoundError):
  @property
  def message(self):
    return 'Document {2} not found.'


class CsrfTokenError(ForbiddenError):
  pass


class InvalidOperationError(ForbiddenError):
  pass


class AlreadyVotedError(ForbiddenError):
  @property
  def message(self):
    return "You've already voted."


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


class DiscussionNodeNotFoundError(NotFoundError):
  @property
  def message(self):
    return 'Discussion node {1} not found.'


class DiscussionNotFoundError(DocumentNotFoundError):
  @property
  def message(self):
    return 'Discussion {1} not found.'


class MessageNotFoundError(NotFoundError):
  @property
  def message(self):
    return 'Message {0} not found.'


class InvalidJoinInvitationCodeError(ForbiddenError):
  @property
  def message(self):
    return 'The invitation code you provided is invalid.'


class ContestAlreadyAttendedError(ForbiddenError):
  @property
  def message(self):
    return "You've already attended this contest."


class ContestNotAttendedError(ForbiddenError):
  @property
  def message(self):
    return "You haven't attended this contest yet."


class ContestScoreboardHiddenError(ForbiddenError):
  @property
  def message(self):
    return 'Contest scoreboard is not visible.'


class ContestNotLiveError(ForbiddenError):
  @property
  def message(self):
    return 'This contest is not live.'


class HomeworkScoreboardHiddenError(ForbiddenError):
  @property
  def message(self):
    return 'Homework scoreboard is not visible.'


class HomeworkNotLiveError(ForbiddenError):
  @property
  def message(self):
    return 'This homework is not open.'


class HomeworkAlreadyAttendedError(ForbiddenError):
  @property
  def message(self):
    return "You've already claimed this homework."


class HomeworkNotAttendedError(ForbiddenError):
  @property
  def message(self):
    return "You haven't claimed this homework yet."


class TrainingRequirementNotSatisfiedError(ForbiddenError):
  @property
  def message(self):
    return 'Training requirement is not satisfied.'


class TrainingAlreadyEnrollError(ForbiddenError):
  @property
  def message(self):
    return "You've already enrolled this training."


class UsageExceededError(ForbiddenError):
  @property
  def message(self):
    return 'Usage exceeded.'

class ModifyBuiltinRoleError(ForbiddenError):
  @property
  def message(self):
    return 'Built-in roles cannot be modified.'


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