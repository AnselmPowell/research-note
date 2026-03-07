type ToastLevel = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  level: ToastLevel;
  duration?: number; // milliseconds, null = sticky
  action?: {
    label: string;
    onClick: () => void;
  };
}

class ToastService {
  private listeners: Set<(toast: Toast) => void> = new Set();
  private dismissCallbacks: Map<string, () => void> = new Map();

  subscribe(listener: (toast: Toast) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  show(message: string, level: ToastLevel = 'info', duration: number = 5000, action?: Toast['action']) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const toast: Toast = { id, message, level, duration, action };

    this.listeners.forEach(listener => listener(toast));

    // Auto-dismiss if duration is set
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  success(message: string, duration?: number) {
    return this.show(message, 'success', duration);
  }

  error(message: string, duration?: number, action?: Toast['action']) {
    return this.show(message, 'error', duration, action);
  }

  info(message: string, duration?: number) {
    return this.show(message, 'info', duration);
  }

  warning(message: string, duration?: number) {
    return this.show(message, 'warning', duration);
  }

  dismiss(id: string) {
    this.dismissCallbacks.get(id)?.();
    this.dismissCallbacks.delete(id);
  }

  registerDismissCallback(id: string, callback: () => void) {
    this.dismissCallbacks.set(id, callback);
  }
}

export const toastService = new ToastService();