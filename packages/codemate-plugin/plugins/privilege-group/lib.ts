import { Err, NotFoundError } from "hydrooj";

export const GroupNotFoundError = Err('GroupNotFoundError', NotFoundError);
export const ActivationCodeNotFoundError = Err('ActivationCodeNotFoundError', NotFoundError);
