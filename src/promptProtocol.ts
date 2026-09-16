export type PromptKind =
  | 'unlock'
  | 'permission'
  | 'groupedPermission'
  | 'counterpartyPermission'
  | 'oneSatPermission'
  | 'usbCheck';

/** A gated wallet call is waiting for a registered USB key to be confirmed present. */
export interface UsbCheckRequest {
  requestID: string;
  /** What the call does, for the copy: "sign a transaction", "decrypt data". */
  reason: string;
  originator?: string;
}

export interface PromptRef {
  kind: PromptKind;
  requestID: string;
}
