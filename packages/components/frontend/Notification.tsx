import { toast } from 'react-toastify';

export default class Notification {
  type: string;
  action: any;
  $dom: JQuery<HTMLElement>;
  $n: JQuery<HTMLElement>;
  duration: number;
  autoHideTimer?: NodeJS.Timeout;

  static async success(message: string, duration?: number) {
    return toast.success(message, { autoClose: duration });
  }

  static async info(message: string, duration?: number) {
    return toast.info(message, { autoClose: duration });
  }

  static async warn(message: string, duration?: number) {
    return toast.warning(message, { autoClose: duration });
  }

  static async error(message: string, duration?: number) {
    return toast.error(message, { autoClose: duration });
  }
}
