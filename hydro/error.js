const { PRIV_USER_PROFILE } = require('./privilege');

class UserFacingError extends Error {
    constructor(type) {
        super(type);
        this.template = 'error';
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
        super(type);
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
class PrivilegeError extends ForbiddenError {
    constructor(priv) {
        super('PrivilegeError');
        this.params = [priv];
    }
}
class OpcountExceededError extends ForbiddenError {
    constructor(op, period_secs, max_operations) {
        super('OpcountExceededError');
        this.params = [op, period_secs, max_operations];
    }
}

class DomainAlreadyExistError extends ForbiddenError {
    constructor(domain) {
        super('DomainAlreadyExistError');
        this.params = [domain];
    }
}
class DomainNotFoundError extends ForbiddenError {
    constructor(domain) {
        super('DomainNotFoundError');
        this.params = [domain];
    }
}

class UserAlreadyDomainMemberError extends ForbiddenError {
    constructor(domainId, uid) {
        super('UserAlreadyDomainMemberError');
        this.params = [domainId, uid];
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
    constructor(domainId, pid) {
        super('ProblemNotFoundError');
        this.params = [domainId, pid];
    }
}
class RecordNotFoundError extends NotFoundError {
    constructor(domainId, rid) {
        super('RecordNotFoundError');
        this.params = [domainId, rid];
    }
}
class TrainingNotFoundError extends NotFoundError {
    constructor(domainId, tid) {
        super('TrainingNotFoundError');
        this.params = [domainId, tid];
    }
}
class ContestNotFoundError extends NotFoundError {
    constructor(domainId, cid) {
        super('ContestNotFoundError');
        this.params = [domainId, cid];
    }
}
module.exports = {
    BadRequestError, ForbiddenError, NotFoundError,
    LoginError, UserAlreadyExistError, InvalidTokenError,
    UserNotFoundError, VerifyPasswordError, PrivilegeError,
    OpcountExceededError, DomainAlreadyExistError, DomainNotFoundError,
    UserAlreadyDomainMemberError, PermissionError, NoProblemError,
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


class BuiltinDomainError(ForbiddenError):
  @property
  def message(self):
    return 'Domain {0} is bulit-in and cannot be modified.'


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


class ProblemDataNotFoundError(NotFoundError):
  @property
  def message(self):
    return 'Data of problem {1} not found.'


class RecordDataNotFoundError(NotFoundError):
  @property
  def message(self):
    return 'Data of record {0} not found.'


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




class DomainJoinForbiddenError(ForbiddenError):
  @property
  def message(self):
    return 'You are not allowed to join the domain. The link is either invalid or expired.'


class DomainJoinAlreadyMemberError(ForbiddenError):
  @property
  def message(self):
    return 'Failed to join the domain. You are already a member.'


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


class DomainRoleAlreadyExistError(ForbiddenError):
  @property
  def message(self):
    return 'Role {1} already exists in domain {0}.'


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