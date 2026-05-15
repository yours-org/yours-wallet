# Yours Wallet Full Redesign Checklist

Target: Phantom Wallet-level polish. Tailwind + framer-motion + lucide-react. Dark premium aesthetic.

---

## Design System & Foundation

- [x] Add Tailwind CSS import to index.css
- [x] Main wallet page (BsvWallet main view) — new layout with staggered animations
- [x] TopNav — glassmorphism dropdown, animated chevron, lucide icons
- [x] BottomMenu — lucide icons, animated tab indicator, spring transitions
- [x] AssetRow — clean cards with hover/tap animation

---

## Phase 1: Core Navigation & Layout Rethink

### 1. Side Drawer Menu (NEW — replaces account switcher in TopNav)

- [ ] Create `SideDrawer.tsx` — slide-in drawer from left (like Phantom)
  - Profile avatar + name at top
  - Account list with switch capability
  - "Add Account" option
  - Network indicator (testnet badge)
  - Quick links: Connected Apps, Export Keys, Lock Wallet
  - Sign Out at bottom
  - Backdrop overlay with blur, smooth slide animation
- [ ] Update TopNav to show hamburger/avatar icon on left that opens drawer
  - Remove account dropdown from TopNav (move to drawer)
  - TopNav becomes: [Avatar trigger] [Yours logo centered] [GitHub or notifications]
  - Cleaner, more minimal top bar

### 2. Settings Page Redesign (`Settings.tsx`)

- [x] Redesign main settings menu as grouped card sections
  - **Account** section: Manage Accounts, Connected Apps, Permissions
  - **Security** section: Export Keys
  - **Preferences** section: Social Profile, Storage
  - **Advanced** section: Re-Sync UTXOs, Lock Wallet
  - **Danger Zone** section: Sign Out (red-tinted)
- [x] Each setting row: lucide icon + label + optional description + chevron/toggle/value on right
- [x] Manage Accounts sub-page: card-based list with create/restore/edit options
- [x] Account List sub-page: account cards with avatar + name + chevron
- [x] Edit Account sub-page: label + icon inputs with save/delete actions
- [x] Connected Apps sub-page: app cards with icon, domain, red X remove button
- [x] Permissions sub-page: delegated to PermissionsManager component with page transition
- [x] Export Keys sub-page: option cards (Master Backup, Download JSON, QR) with progress bar
- [x] Social Profile sub-page: avatar preview circle + display name + avatar URL inputs
- [x] Preferences sub-page: password toggle, auto-approve limit, custom fee rate inline
- [x] SpeedBump modal: preserved existing component (overlays cleanly over redesign)
- [x] Staggered entrance animations for all rows via framer-motion
- [x] Smooth AnimatePresence page transitions between all sub-pages
- [x] Hover x-shift and scale effects on interactive rows
- [x] Removed all styled-components in favour of Tailwind + inline styles

### 3. BottomMenu Polish

- [ ] Verify animation smoothness across all tab switches
- [ ] Consider replacing "Tools" label with "Apps" to match modern wallets

---

## Phase 2: Transaction Flows

### 4. Send BSV Flow (BsvWallet send view)

- [x] Full-page send view with clean header ("Send BSV" + back arrow)
- [x] Recipient cards: rounded-2xl with address label + amount input
- [x] Amount input: BSV/USD toggle pill overlaid on input right side (ArrowUpDown icon)
- [x] Multi-recipient: AnimatePresence cards with Trash2 delete + Plus add animations
- [x] Balance displayed as a MAX pill chip (tap to fill all)
- [x] Send button: full-width gradient via Button component
- [x] Removed RecipientRow, RecipientInputs, InputWrapper, UnitSwitcher, ScrollableConfirmContent styled-components

### 5. Receive Flow (BsvWallet receive view)

- [x] Clean layout with ArrowLeft back button in header row
- [x] Large QR code (redesigned QrCode component)
- [x] Address display card with animated Copy/Check icon feedback (copiedAddress state)
- [x] Info text about supported assets (BSV, MNEE, Ordinals)
- [x] Entrance animation (fade + slide up via framer-motion)
- [x] Removed CopyAddressWrapper, StyledCopy, Icon styled-components

### 6. Send MNEE Flow (BsvWallet sendMNEE view)

- [x] Matches Send BSV design language
- [x] MNEE icon + balance MAX chip at top (tap handleSendAllMnee)
- [x] Input cards (address + amount) with section labels in rounded-2xl rows
- [x] Swap & Bridge as orange-tinted card/banner with ExternalLink icon
- [x] Removed SwapAndBridgeButtonContainer, SwapAndBridgeButton, ScrollableConfirmContent styled-components

### 7. Get MNEE Flow (BsvWallet getMNEE view)

- [x] Clean info card with MNEE icon, name, USD peg, and description
- [x] QR code for mobile referral scan
- [x] Consistent header with ArrowLeft back button
- [x] Removed GetMneeContainer styled-component

---

## Phase 3: Asset Detail & History

### 8. Per-Asset History (NEW PATTERN)

- [ ] Tapping an asset row (BSV, MNEE, token) opens an asset detail view
  - Large icon + name + balance at top
  - Price/USD conversion below
  - Send / Receive action buttons
  - Transaction history list filtered to that asset
  - Each tx: direction arrow, amount, date, status indicator
- [ ] This replaces the single "Recent Activity" button
- [ ] Keep "Recent Activity" as a fallback/all-assets view

### 9. TxHistory Redesign (`TxHistory.tsx`)

- [x] Full-screen overlay with spring entrance animation
- [x] Clean transaction rows: direction icon (ArrowDownLeft/Up/LeftRight), description, amount
- [x] Group by date (Today, Yesterday, This Week, Earlier)
- [x] Expandable rows for multi-output transactions (ChevronDown/Up)
- [x] Explorer link as subtle ExternalLink icon (stopPropagation on click)
- [x] Pagination preserved (Previous/Next buttons)
- [x] Empty state: ArrowLeftRight icon + "No transactions yet"

### 10. ManageTokens Redesign (`ManageTokens.tsx`)

- [x] Slide-up sheet with spring entrance animation (y: 100% → 0)
- [x] Search input with Search icon, real-time filtering
- [x] Token rows: icon, name, truncated id, Star + ToggleSwitch
- [x] X close button (top-right, circular)
- [x] Staggered AnimatePresence on token rows

---

## Phase 4: Ordinals & NFTs

### 11. OrdWallet Page Redesign (`OrdWallet.tsx`)

- [x] Grid layout with proper card sizing and gaps
- [x] NFT cards: rounded corners, subtle shadow, image fill
- [x] Filter tabs at top (All, My Listings, My Ordinals) as pill buttons
- [x] Selection mode: checkmark overlay on selected items
- [x] Bottom action bar appears when items selected (Transfer, List, Cancel)
- [x] Transfer flow: clean multi-address form
- [x] List flow: price input with BSV conversion
- [x] Empty state: illustration + "No ordinals yet"
- [x] Lazy-load with skeleton placeholders

---

## Phase 5: Tools & Apps

### 12. AppsAndTools Page Redesign (`AppsAndTools.tsx`)

- [x] Rename to "Apps" or "Explore"
- [x] Featured apps section: horizontal scroll cards with icons
- [x] Tools section as a clean grid/list:
  - Lock BSV (with lock icon)
  - Pending Locks (with unlock icon)
  - Decode/Broadcast (with code icon)
  - Sweep Private Key (with key icon)
  - Support Yours (with heart icon)
- [x] Each tool: card with icon, title, description, chevron
- [x] Discover Apps: better app directory cards
- [x] Lock BSV sub-page: cleaner form with date picker
- [x] Pending Locks sub-page: card list with unlock progress bars
- [x] Decode/Broadcast sub-page: format selector pills, clean textarea
- [x] Sponsor/Donate sub-page: amount selection as pill chips

---

## Phase 6: Onboarding & Auth

### 13. Start/Onboarding Page (`Start.tsx`)

- [x] Clean centered layout with large logo
- [x] Two primary buttons: "Create Wallet" + "Restore Wallet"
- [x] Subtle background gradient or pattern
- [x] Smooth entrance animation (staggered fade-up)

### 14. CreateAccount Flow (`CreateAccount.tsx`)

- [x] Step progress indicator (animated pill dots at top)
- [x] Step 1: Clean form cards for name, icon, password, network toggle
- [x] Step 2: Seed phrase display as numbered 3-col word grid with copy button
- [x] Step 3: Success animation (CheckCircle spring entrance)
- [x] Consistent back/forward navigation with AnimatePresence slide transitions
- [x] Removed styled-components; full Tailwind + framer-motion

### 15. RestoreAccount Flow (`RestoreAccount.tsx`)

- [x] Wallet selection list with ChevronRight icons and logo images
- [x] Seed phrase textarea with clean focus ring + expert derivations panel
- [x] Password step matching CreateAccount style
- [x] Success step with CheckCircle spring animation
- [x] AnimatePresence slide transitions between all 4 steps
- [x] Removed styled-components; full Tailwind + framer-motion

### 16. ImportAccount Flow (`ImportAccount.tsx`)

- [x] Clean WIF key input fields with security warning
- [x] JSON upload button with Upload icon (replaces styled secondary-outline)
- [x] Password + name fields matching other flows
- [x] Success step with CheckCircle spring animation
- [x] AnimatePresence slide transitions between 3 steps
- [x] Removed styled-components; full Tailwind + framer-motion

### 17. MasterRestore (`MasterRestore.tsx`)

- [x] Drag-and-drop ZIP upload zone with hover state
- [x] Selected file chip with dismiss button
- [x] Inline animated progress bar during restore
- [x] Password field with shake animation on error
- [x] AnimatePresence transitions between upload/password phases
- [x] Removed styled-components; full Tailwind + framer-motion

### 18 (was 17). UnlockWallet (`UnlockWallet.tsx`)

- [x] Centered logo with animated Lock badge overlay
- [x] Clean password input (existing shake animation preserved)
- [x] Loading spinner state (Loader2) during unlock
- [x] Staggered entrance animation (logo → title → form)
- [x] Removed styled-components; full Tailwind + framer-motion

---

## Phase 7: Request/Approval Overlays

### 18. ConnectRequest (`ConnectRequest.tsx`)

- [x] Centered modal card with app icon
- [x] App name + domain prominently displayed
- [x] Permission list with clean checkmarks (lucide Check + green accent)
- [x] Connect/Cancel buttons (green gradient / gray outline)
- [x] Slide-up + scale entrance animation via framer-motion
- [x] Removed all styled-components

### 19. TransactionApproval (`TransactionApprovalRequest.tsx`)

- [x] Modal card with transaction summary (header icon + title)
- [x] Amount display (large, prominent) when satsOut available
- [x] Fallback info rows (inputs / outputs / total output)
- [x] Warning notice for unfamiliar transactions
- [x] Approve/Reject buttons (gradient / outline)
- [x] Removed all styled-components

### 20. PermissionRequest pages

- [x] Consistent modal card design — PermissionRequest, GroupedPermissionRequest, CounterpartyPermissionRequest
- [x] Permission descriptions with lucide icons (Shield, Users)
- [x] Grouped permissions with section labels + checkbox rows
- [x] Approve/Deny actions (gradient / outline)
- [x] Privileged operation warning banner
- [x] Removed all styled-components

### 21. MNEESendRequest (`MNEESendRequest.tsx`)

- [x] MNEE icon (rounded circle) + large amount display
- [x] Recipient list card (single or multi)
- [x] Warning notice before confirming
- [x] Approve + Cancel buttons
- [x] Removed all styled-components

---

## Phase 8: Shared Components

### 22. Button Component (`Button.tsx`)

- [x] Rewrite with Tailwind + framer-motion
- [x] Variants: primary (gradient), secondary, outline, warn
- [x] Loading state with spinner (Loader2 icon)
- [x] Disabled state styling
- [x] framer-motion hover/tap (spring animation)

### 23. Input Component (`Input.tsx`)

- [x] Rewrite with Tailwind + framer-motion
- [x] Consistent height, padding, border radius (rounded-xl)
- [x] Focus ring with accent color glow
- [x] Shake animation preserved via framer-motion

### 24. QrCode Component (`QrCode.tsx`)

- [x] Cleaner container with rounded-2xl corners
- [x] Copy-on-tap feedback (green check overlay with AnimatePresence)
- [x] Subtle border + hover/tap spring animation

### 25. PageLoader (`PageLoader.tsx`)

- [x] Centered spinner with framer-motion rotation
- [x] Progress message with fade-in animation
- [x] Smooth fade-in on mount
- [x] Backward-compat exports for LoaderContainer/Loader

### 26. Snackbar (`Snackbar.tsx`)

- [x] Bottom toast with slide-up framer-motion spring animation
- [x] Lucide icons (AlertCircle / CheckCircle2 / Info) + message
- [x] Auto-dismiss progress bar (scaleX over duration)
- [x] Rounded-xl card, theme-aware bg/text colors

### 27. Bsv21TokensList (`Bsv21TokensList.tsx`)

- [x] Consistent with AssetRow design (uses AssetRow component)
- [x] Section headers (Confirmed / Pending) as 10px uppercase gray text
- [x] Drag-to-reorder preserved (react-beautiful-dnd intact)
- [x] Empty state: Coins icon + message centered

### 28. SendBsv21View (`SendBsv21View.tsx`)

- [x] Matches Send BSV design language (ArrowLeft header, card inputs)
- [x] Token icon + name + MAX balance chip in identity card
- [x] Address + amount in rounded-2xl section cards
- [x] Trade button as outlined, Send as primary gradient

### 29. FaucetButton (`FaucetButton.tsx`)

- [x] Subtle pill button with gradient outline
- [x] Lucide icons (Droplets, Loader2)
- [x] framer-motion hover/tap animation
- [x] Loading state with spinner

### 30. UpgradeNotification (`UpgradeNotification.tsx`)

- [x] Slide-up framer-motion entrance (y: 100% → 0)
- [x] Inner card: YoursIcon + Sparkles badge + title + description
- [x] Radial glow backdrop for premium feel
- [x] "Get Started" primary gradient button

---

## Phase 9: Polish & Consistency

### 31. Sweep Migration (`SweepMigration.tsx`)

- [x] Step progress bar (6-step pill strip, active/done/inactive states)
- [x] Clean card-based asset review (rowBg rounded-2xl cards per asset type)
- [x] Progress indicators per asset type (scanning: animated Loader2, done: Check, error: X)
- [x] Results cards with tx links (ExternalLink icon, monospace txid, error messages)
- [x] Intro: Shield + AlertTriangle info cards, Start Migration + Skip CTA
- [x] Password: Lock icon, form, error handling
- [x] Scanning: per-address status rows with animated spinner + progress bar
- [x] Review: BSV/Ordinals/OpNS/BSV21 selectable cards + non-sweepable grayed cards + notice
- [x] Sweeping: warning banner + PageLoader + completed-so-far rows
- [x] Results: CheckCircle/AlertTriangle header, result cards per asset, Done button
- [x] Removed all styled-components; full Tailwind + framer-motion + lucide-react

### 32. Global Consistency Pass

- [ ] Remove all unused styled-components
- [ ] Ensure all pages use consistent spacing (px-4, gap-3, etc.)
- [ ] Verify all modals/overlays use consistent animation patterns
- [ ] Check all empty states have proper illustrations/messages
- [ ] Ensure keyboard accessibility on all interactive elements
- [ ] Test scrolling behavior on all pages (smooth, no jank)

### 33. Transition Away from styled-components

- [ ] Identify which styled-components can be removed per file
- [ ] Keep styled-components only where Tailwind conversion isn't practical
- [ ] Eventually remove styled-components dependency entirely

---

## Notes

- All changes are design-only. No functional/logic changes.
- Theme colors must be applied via inline styles (since they come from context)
- Extension popup viewport: ~392 x 600px max
- Use framer-motion for all animations (already installed)
- Use lucide-react for all icons (already installed)
- Use tailwind-merge + clsx + cva for class composition (already installed)
