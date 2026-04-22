export type ActionState<T = any> = {
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string | null;
  payload?: T;
  fieldErrors?: Record<string, string[]>;
};

export const EMPTY_ACTION_STATE: ActionState = {
  status: 'idle',
  message: null,
};
