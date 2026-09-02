export type PromptKind = 'unlock' | 'permission' | 'groupedPermission' | 'counterpartyPermission' | 'oneSatPermission';

export interface PromptRef {
  kind: PromptKind;
  requestID: string;
}
