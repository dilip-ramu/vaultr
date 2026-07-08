import type { FigureSpec } from '@/components/guide/GuideFigure'
import type { ScreenSpec } from '@/components/guide/GuideShot'

/**
 * The whole in-app Guide, as data. Rendered by components/guide/GuideClient.tsx
 * in the 22a (desktop) / 22b (mobile) layout: a topic dropdown switches the
 * article tree; each article is a list of blocks.
 *
 * To extend: add an Article to a Group, or a Group/Topic below. `h` blocks feed
 * the "On this page" rail, so give each one a stable `id`.
 */

export type Block =
  | { t: 'lead'; text: string }
  | { t: 'p'; text: string }
  | { t: 'h'; id: string; text: string }
  | { t: 'steps'; items: { title: string; detail?: string; action?: string }[] }
  | { t: 'callout'; variant: 'tip' | 'info' | 'warn'; title?: string; text: string }
  | { t: 'figure'; fig: FigureSpec }
  | { t: 'shot'; shot: ScreenSpec }
  | { t: 'list'; items: string[] }
  | { t: 'faq'; items: { q: string; a: string }[] }

export interface Article { id: string; title: string; subtitle?: string; blocks: Block[] }
export interface Group { label: string; articles: Article[] }
export interface Topic { id: string; label: string; icon: string; blurb?: string; groups: Group[] }

export const GUIDE: Topic[] = [
  // ══════════════════════════════════ GETTING STARTED ══════════════════════════════════
  {
    id: 'getting-started',
    label: 'Getting started',
    icon: 'rocket',
    blurb: 'Set up Vaultr and learn your way around.',
    groups: [
      {
        label: 'First steps',
        articles: [
          {
            id: 'welcome',
            title: 'Welcome to Vaultr',
            subtitle: 'What Vaultr does and the 5-minute path to a working setup',
            blocks: [
              { t: 'lead', text: 'Vaultr keeps every rupee — in and out — in one place: accounts, invoicing, payroll, budgets and cashflow. This guide walks through each area, feature by feature.' },
              { t: 'callout', variant: 'tip', title: 'New here? Start with the 4 steps below.', text: 'Most teams are fully set up in under 15 minutes.' },
              { t: 'h', id: 'steps', text: 'The 4 setup steps' },
              { t: 'steps', items: [
                { title: 'Set up your company', detail: 'Legal name, GSTIN and invoice prefix.', action: 'Setup → Company' },
                { title: 'Add your bank accounts', detail: 'Current, savings and credit cards.', action: 'Accounts → + Add Account' },
                { title: 'Import a statement', detail: 'Bring in history from a CSV.', action: 'Transactions → Fetch' },
                { title: 'Send your first invoice', detail: 'Pick a template and bill a customer.', action: 'Customers → Invoices' },
              ] },
              { t: 'h', id: 'tour', text: 'A quick tour' },
              { t: 'p', text: 'The sidebar groups everything into four areas — your money (Home, Transactions, Accounts, Insights), Sales & Purchases, Team, and System. Press ⌘K anywhere to jump to a screen or run an action.' },
              { t: 'shot', shot: {
                chrome: 'browser', url: '/dashboard', nav: 'Home',
                header: { title: 'Home', subtitle: 'Your money at a glance' },
                band: [
                  { label: 'Net worth', value: '₹ 12,40,000', pin: { n: 1, label: 'Net worth — everything you own minus what you owe' } },
                  { label: 'Money in', value: '₹ 3,10,000', pin: { n: 2, label: 'Money in this month' } },
                  { label: 'Money out', value: '₹ 1,86,000', pin: { n: 3, label: 'Money out this month' } },
                ],
                items: [
                  { type: 'groupLabel', text: 'Recent activity' },
                  { type: 'row', cells: ['Adobe Creative Cloud', 'Today', '– ₹4,230'], strongFirst: true },
                  { type: 'row', cells: ['Client payment — Acme', 'Yesterday', '+ ₹1,20,000'], strongFirst: true },
                ],
                caption: 'The Home dashboard. The sidebar on the left is how you move around the whole app.',
              } },
            ],
          },
          {
            id: 'setup-company',
            title: 'Set up your company',
            subtitle: 'Name, GSTIN, address, logo and invoice numbering',
            blocks: [
              { t: 'lead', text: 'Your company details appear on every invoice, salary slip and contract, so set them up first.' },
              { t: 'steps', items: [
                { title: 'Open Setup', detail: 'Sidebar → System → Setup, then choose Company.', action: 'Setup → Company' },
                { title: 'Fill legal details', detail: 'Company name, address, GSTIN and contact email/phone.' },
                { title: 'Upload a logo & signature', detail: 'These render at the top of documents and above the signature line.' },
                { title: 'Set your invoice prefix & numbering', detail: 'e.g. INV-2026-. New invoices auto-number from here.' },
              ] },
              { t: 'shot', shot: {
                chrome: 'browser', url: '/setup', nav: 'Setup',
                header: { title: 'Setup' },
                tabs: [
                  { label: 'Company', active: true, pin: { n: 1, label: 'Open the Company section' } },
                  { label: 'Email' }, { label: 'Categories' }, { label: 'Account types' }, { label: 'Currencies' },
                ],
                items: [
                  { type: 'field', label: 'Company name', value: 'Northstar Trading Pvt Ltd', pin: { n: 2, label: 'Legal name (shown on documents)' } },
                  { type: 'field', label: 'GSTIN', value: '29ABCDE1234F1Z5', pin: { n: 3, label: 'Your GSTIN' } },
                  { type: 'field', label: 'Invoice prefix', value: 'INV-2026-', pin: { n: 4, label: 'Prefix + starting number for invoices' } },
                  { type: 'button', label: 'Save company', primary: true, pin: { n: 5, label: 'Save' } },
                ],
                caption: 'Setup is a two-pane screen — sections along the top, the form below. Fill Company first.',
              } },
              { t: 'callout', variant: 'info', text: 'Running more than one company? Each can carry its own logo, accent colour and bank details — see Documents & templates → Company branding.' },
            ],
          },
          {
            id: 'add-accounts',
            title: 'Add your bank accounts',
            subtitle: 'Current, savings, credit cards and custom types',
            blocks: [
              { t: 'lead', text: 'Accounts are where balances live. Add one for every real account, card or wallet you want to track.' },
              { t: 'steps', items: [
                { title: 'Open Accounts', action: 'Sidebar → Accounts' },
                { title: 'Click + Add Account', detail: 'Top-right of the Accounts page.', action: '+ Add Account' },
                { title: 'Pick a type', detail: 'Checking, Savings, Credit, Loan… or make your own with + New type.' },
                { title: 'Enter the opening balance', detail: 'Type the balance as it stands today; Vaultr tracks changes from here.' },
                { title: 'Add bank details (optional)', detail: 'Account number, IFSC, SWIFT and Customer ID (CIF) live in the Bank Details tab.' },
              ] },
              { t: 'shot', shot: {
                chrome: 'browser', url: '/accounts', nav: 'Accounts',
                header: { title: 'Accounts', subtitle: '3 accounts across 2 types', button: { label: '+ Add Account', pin: { n: 1, label: 'Click + Add Account (top-right)' } } },
                items: [
                  { type: 'groupLabel', text: 'Checking' },
                  { type: 'card', title: 'HDFC Current', sub: '••2841', tag: 'Checking', color: '#2F6FED', emoji: '🏦' },
                  { type: 'groupLabel', text: 'Credit' },
                  { type: 'card', title: 'Amex Platinum', sub: '••1007', tag: 'Credit', color: '#7C3AED', emoji: '💳' },
                ],
                caption: 'The Accounts page. New accounts are added from the top-right button and then group under their type.',
              } },
              { t: 'callout', variant: 'tip', text: 'You can create a new account type on the spot from the account form — tap + New type, name it (e.g. PPF, Gold), pick a colour, and it is saved and selected.' },
            ],
          },
          {
            id: 'import-statement',
            title: 'Import your first statement',
            subtitle: 'Bring in history from a CSV',
            blocks: [
              { t: 'lead', text: 'Rather than typing months of history, import a bank statement CSV and map its columns once.' },
              { t: 'steps', items: [
                { title: 'Open Transactions → Fetch', action: 'Transactions → Fetch' },
                { title: 'Upload the CSV', detail: 'Drag the file in or browse for it.' },
                { title: 'Map the columns', detail: 'Tell Vaultr which columns are Date, Description, Amount and (optionally) balance.' },
                { title: 'Pick the account', detail: 'Choose which account these rows belong to.' },
                { title: 'Review & import', detail: 'Duplicates are flagged; confirm to add the rest.' },
              ] },
              { t: 'shot', shot: {
                chrome: 'browser', url: '/transactions/fetch', nav: 'Transactions',
                header: { title: 'Fetch → Import statement' },
                tabs: [
                  { label: 'Upload', active: true, pin: { n: 1, label: 'Upload your CSV' } },
                  { label: 'Map columns', pin: { n: 2, label: 'Match Date / Description / Amount' } },
                  { label: 'Review', pin: { n: 3, label: 'Review & confirm' } },
                ],
                items: [
                  { type: 'field', label: 'Account for these rows', value: 'HDFC Current', pin: { n: 4, label: 'Pick the destination account' } },
                  { type: 'button', label: 'Import 128 rows', primary: true, pin: { n: 5, label: 'Import' } },
                ],
                caption: 'The import wizard walks upload → map → review. Duplicates are flagged before import.',
              } },
            ],
          },
          {
            id: 'first-invoice',
            title: 'Send your first invoice',
            subtitle: 'Pick a template and bill a customer',
            blocks: [
              { t: 'lead', text: 'Once your company is set up, raising an invoice takes under a minute.' },
              { t: 'steps', items: [
                { title: 'Open Customers → Invoices', action: 'Customers → Invoices' },
                { title: 'Click New invoice', action: 'New invoice' },
                { title: 'Choose the company & customer', detail: 'The company sets the branding; the customer sets who is billed.' },
                { title: 'Add line items', detail: 'Description, quantity, rate and GST rate per line.' },
                { title: 'Review & save', detail: 'Vaultr shows a live preview, then generates the PDF.' },
              ] },
              { t: 'shot', shot: {
                chrome: 'browser', url: '/customers/invoices/new', nav: 'Customers',
                header: { title: 'New invoice' },
                items: [
                  { type: 'field', label: 'Company (branding)', value: 'Northstar Trading Pvt Ltd', pin: { n: 1, label: 'Choose the billing company' } },
                  { type: 'field', label: 'Bill to (customer)', value: 'Acme Retail LLP', pin: { n: 2, label: 'Choose the customer' } },
                  { type: 'row', cells: ['Consulting — HSN 9983', '10 × ₹5,000', '₹50,000'], strongFirst: true, pin: { n: 3, label: 'Add line items (qty, rate, GST%)' } },
                  { type: 'button', label: 'Save & generate PDF', primary: true, pin: { n: 4, label: 'Save' } },
                ],
                caption: 'Creating an invoice. A live preview updates as you type.',
              } },
              { t: 'callout', variant: 'info', text: 'Invoices are covered in depth under Customers & sales → Invoicing customers.' },
            ],
          },
        ],
      },
      {
        label: 'Finding your way',
        articles: [
          {
            id: 'navigation',
            title: 'The sidebar & sections',
            subtitle: 'How the app is organised',
            blocks: [
              { t: 'lead', text: 'The left sidebar is grouped into four sections. Items with a chevron expand to reveal sub-pages.' },
              { t: 'list', items: [
                'Your money — Home, Transactions (+ Fetch), Accounts (+ Cards), Insights (+ Profitability, Forecast).',
                'Sales & Purchases — Customers (Invoices, Incoming, TDS) and Suppliers (Invoices, Fetch).',
                'Team — Payroll (+ Slips) and Organization (Employees, Contracts, Templates).',
                'System — Setup (+ Downloads) and this Guide.',
              ] },
              { t: 'callout', variant: 'tip', text: 'On a phone the sidebar becomes a drawer — tap the menu icon, or use the bottom tabs for the most common screens.' },
            ],
          },
          {
            id: 'command-palette',
            title: 'Quick actions with ⌘K',
            subtitle: 'Jump anywhere or run an action',
            blocks: [
              { t: 'lead', text: 'Press ⌘K (Ctrl+K on Windows) from any screen to open the command palette.' },
              { t: 'p', text: 'Start typing a page name to jump to it, or an action like "Add transaction" or "New invoice" to run it without navigating first.' },
              { t: 'figure', fig: { kind: 'modal', title: 'Command palette', rows: ['Go to Accounts', 'Add transaction', 'New invoice', 'Run payroll'], highlight: 'Add transaction', caption: '⌘K — search screens and actions.' } },
            ],
          },
          {
            id: 'hide-balances',
            title: 'Hide balances',
            subtitle: 'A one-tap privacy switch for the whole app',
            blocks: [
              { t: 'lead', text: 'The eye toggle in the sidebar footer hides every amount across the app — dashboards, accounts, invoices, everything — so you can use Vaultr in public.' },
              { t: 'steps', items: [
                { title: 'Find the eye button', detail: 'Sidebar footer, just above Dark Mode (in the mobile drawer too).' },
                { title: 'Tap to hide', detail: 'All totals and summaries become ••••••.' },
                { title: 'Tap again to reveal', detail: 'The setting is remembered on this device and syncs across open tabs.' },
              ] },
              { t: 'callout', variant: 'info', text: 'Transaction line amounts stay visible so you can still work; only totals and summary figures are masked.' },
            ],
          },
          {
            id: 'appearance',
            title: 'Dark mode & appearance',
            subtitle: 'Switch themes and font',
            blocks: [
              { t: 'lead', text: 'Vaultr follows your system light/dark setting and can be flipped manually.' },
              { t: 'steps', items: [
                { title: 'Open the sidebar footer', detail: 'Use the Dark Mode toggle.' },
                { title: 'Pick your mode', detail: 'Light, dark or system.' },
              ] },
            ],
          },
        ],
      },
    ],
  },
  // ══════════════════════════════════ TRANSACTIONS ══════════════════════════════════
  {
    id: 'transactions',
    label: 'Transactions',
    icon: 'arrow-left-right',
    blurb: 'Record, import and organise money in and out.',
    groups: [
      {
        label: 'Recording money',
        articles: [
          {
            id: 'add-transaction',
            title: 'Add a transaction',
            subtitle: 'The stepped entry flow',
            blocks: [
              { t: 'lead', text: 'Adding a transaction is a short four-step flow so nothing important gets missed.' },
              { t: 'steps', items: [
                { title: 'Start a new transaction', detail: 'Sidebar → Add Transaction, press ⌘K → Add transaction, or the + on the Transactions page.', action: 'Add Transaction' },
                { title: 'Choose the type', detail: 'Income, Expense or Transfer.' },
                { title: 'Enter the amount', detail: 'The in-app keypad opens; you can even type a quick sum like 200+50.' },
                { title: 'Pick account, category & date', detail: 'The account picker shows each account’s avatar or initial.' },
                { title: 'Review & save', detail: 'The final step summarises everything before you commit.' },
              ] },
              { t: 'shot', shot: {
                chrome: 'browser', url: '/transactions', nav: 'Transactions',
                header: { title: 'Add transaction' },
                tabs: [
                  { label: '① Type', active: true, pin: { n: 1, label: 'Income · Expense · Transfer' } },
                  { label: '② Amount', pin: { n: 2, label: 'Enter the amount (calculator keypad)' } },
                  { label: '③ Details', pin: { n: 3, label: 'Account · category · date' } },
                  { label: '④ Review' },
                ],
                items: [
                  { type: 'field', label: 'Amount', value: '₹ 4,230', pin: { n: 4, label: 'Type a number — or a sum like 200+50' } },
                  { type: 'button', label: 'Next', primary: true, pin: { n: 5, label: 'Move to the next step' } },
                ],
                caption: 'The stepped Add-transaction dialog. Every step is the same size, so it never jumps around.',
              } },
              { t: 'callout', variant: 'tip', text: 'The amount field has a built-in calculator keypad — tap the keys or type an expression and Vaultr works out the total.' },
            ],
          },
          {
            id: 'edit-delete-txn',
            title: 'Edit or delete a transaction',
            blocks: [
              { t: 'lead', text: 'Made a mistake? Open any transaction to edit it in the same stepped form, or remove it.' },
              { t: 'steps', items: [
                { title: 'Open the transaction', detail: 'Tap its row in the Transactions list.' },
                { title: 'Edit', detail: 'The redesigned stepped form opens pre-filled; change any field and save.', action: 'Edit' },
                { title: 'Delete', detail: 'Use the delete action; you’ll be asked to confirm.' },
              ] },
            ],
          },
          {
            id: 'transfers',
            title: 'Transfers between accounts',
            blocks: [
              { t: 'lead', text: 'A transfer moves money between two of your own accounts without counting as income or expense.' },
              { t: 'steps', items: [
                { title: 'Add a transaction and choose Transfer', detail: 'Step one of the entry flow.' },
                { title: 'Pick "from" and "to" accounts', detail: 'Both balances update in one entry.' },
                { title: 'Save', detail: 'The transfer shows on both accounts’ ledgers.' },
              ] },
            ],
          },
          {
            id: 'categorising',
            title: 'Categorising transactions',
            subtitle: 'Keep budgets and insights meaningful',
            blocks: [
              { t: 'lead', text: 'Categories power your budgets and Insights. Assign one to every transaction where it matters.' },
              { t: 'p', text: 'Categories are managed under Setup → Categories (income and expense have separate lists, each with a colour and emoji). Assign a category while adding or editing a transaction.' },
              { t: 'callout', variant: 'info', text: 'See Setup, data & settings → Categories to create and reorder them.' },
            ],
          },
          {
            id: 'recurring',
            title: 'Recurring transactions',
            subtitle: 'Rent, subscriptions and salaries that repeat',
            blocks: [
              { t: 'lead', text: 'Mark a transaction as recurring and Vaultr will create the next one automatically on schedule.' },
              { t: 'steps', items: [
                { title: 'Turn on recurring while adding', detail: 'Set the cadence (e.g. monthly on the 3rd).' },
                { title: 'Let it run', detail: 'On the due date the next entry is generated for you.' },
              ] },
              { t: 'callout', variant: 'warn', text: 'If a due recurring item hasn’t appeared, check the date and that the schedule is still active — recurring runs once per day.' },
            ],
          },
        ],
      },
      {
        label: 'Bringing data in',
        articles: [
          {
            id: 'fetch-email',
            title: 'Fetch transactions from email',
            subtitle: 'Turn bank alert emails into draft transactions',
            blocks: [
              { t: 'lead', text: 'Connect an email inbox and Vaultr reads bank alert emails, proposing draft transactions you can approve.' },
              { t: 'steps', items: [
                { title: 'Connect email', detail: 'Setup → Email; follow the connection steps.', action: 'Setup → Email' },
                { title: 'Open Transactions → Fetch', action: 'Transactions → Fetch' },
                { title: 'Review the drafts', detail: 'Each parsed alert becomes a draft with amount, date and a guessed account.' },
                { title: 'Approve or edit', detail: 'Confirm the ones you want; they post to the ledger.' },
              ] },
              { t: 'figure', fig: { kind: 'listPage', title: 'Fetch', rows: ['HDFC — debit ₹1,200', 'ICICI — credit ₹45,000', 'Amex — debit ₹3,410'], highlight: 'HDFC — debit ₹1,200', caption: 'Parsed alerts arrive as drafts to approve.' } },
            ],
          },
          {
            id: 'import-csv',
            title: 'Import a CSV statement',
            blocks: [
              { t: 'lead', text: 'Bulk-import history or a monthly statement from any bank by mapping its columns.' },
              { t: 'steps', items: [
                { title: 'Transactions → Fetch → upload CSV', action: 'Upload CSV' },
                { title: 'Map Date, Description and Amount', detail: 'Save the mapping so next time is one click.' },
                { title: 'Pick the destination account' },
                { title: 'Review duplicates and import' },
              ] },
            ],
          },
          {
            id: 'inbox-review',
            title: 'Review the transaction inbox',
            blocks: [
              { t: 'lead', text: 'The inbox is where fetched or imported items wait for your approval before they hit your books.' },
              { t: 'list', items: [
                'Approve — posts the transaction as-is.',
                'Edit — fix the account, category or amount first.',
                'Dismiss — ignore an alert that isn’t a real transaction.',
              ] },
            ],
          },
        ],
      },
      {
        label: 'Working with the list',
        articles: [
          {
            id: 'filter-search',
            title: 'Filter, search & date range',
            blocks: [
              { t: 'lead', text: 'The Transactions page has a summary band on top and a searchable, filterable list below.' },
              { t: 'list', items: [
                'Search by description, amount or account.',
                'Filter by type (income / expense / transfer), account or category.',
                'Set a date range to focus on a period; the top band totals update to match.',
              ] },
              { t: 'figure', fig: { kind: 'table', title: 'Transactions', tabs: ['All', 'Income', 'Expense', 'Transfers'], rows: ['DESCRIPTION', 'DATE', 'AMOUNT', ''], caption: 'Summary band on top; filterable ledger below.' } },
              { t: 'callout', variant: 'info', text: 'Only the totals in the top band are hidden by the eye toggle — individual lines stay readable.' },
            ],
          },
        ],
      },
    ],
  },
  // ══════════════════════════════════ ACCOUNTS & CARDS ══════════════════════════════════
  {
    id: 'accounts',
    label: 'Accounts & cards',
    icon: 'wallet',
    blurb: 'Bank accounts, credit and debit cards, and reconciliation.',
    groups: [
      {
        label: 'Accounts',
        articles: [
          {
            id: 'add-account',
            title: 'Add a bank account',
            blocks: [
              { t: 'lead', text: 'Create an account for every bank account, card or wallet you want balances for.' },
              { t: 'steps', items: [
                { title: 'Accounts → + Add Account', action: '+ Add Account' },
                { title: 'Name it and pick a type' },
                { title: 'Set the opening balance', detail: 'The balance as it stands today.' },
                { title: 'Add bank details', detail: 'Account number, holder, IFSC, SWIFT and Customer ID in the Bank Details tab.' },
              ] },
              { t: 'shot', shot: {
                chrome: 'browser', url: '/accounts', nav: 'Accounts',
                header: { title: 'New account' },
                items: [
                  { type: 'field', label: 'Account name', value: 'HDFC Current', pin: { n: 1, label: 'Name it' } },
                  { type: 'field', label: 'Account type', value: 'Checking', pin: { n: 2, label: 'Pick a type (or + New type)' } },
                  { type: 'field', label: 'Opening balance', value: '₹ 2,84,000', pin: { n: 3, label: 'Balance as it stands today' } },
                  { type: 'field', label: 'Account number', value: '•••• 2841', pin: { n: 4, label: 'Bank details (optional)' } },
                  { type: 'button', label: 'Save account', primary: true, pin: { n: 5, label: 'Save' } },
                ],
                caption: 'The account form. Type sets the card colour and which group it appears under.',
              } },
            ],
          },
          {
            id: 'account-types',
            title: 'Account types & custom types',
            subtitle: 'Built-in types plus your own',
            blocks: [
              { t: 'lead', text: 'Beyond the built-in types (Checking, Savings, Credit, Loan…) you can add your own — PPF, NPS, Gold, Crypto and so on.' },
              { t: 'steps', items: [
                { title: 'Create on the fly', detail: 'In the account form, tap + New type, name it, pick a colour, and it’s saved and selected.', action: '+ New type' },
                { title: 'Or manage them in Setup', detail: 'Setup → Account types lets you rename or recolour built-in types and edit/delete custom ones.', action: 'Setup → Account types' },
              ] },
              { t: 'callout', variant: 'tip', text: 'Custom accounts show your chosen type name (not "Other") both on the card and as the group heading.' },
            ],
          },
          {
            id: 'account-groups',
            title: 'How the Accounts page is organised',
            blocks: [
              { t: 'lead', text: 'Accounts are split into groups by type, each under its own heading with a colour dot and count.' },
              { t: 'p', text: 'Use the type chips at the top to filter to a single group, or "All" to see everything. A Net Worth band summarises assets, liabilities and available credit.' },
              { t: 'figure', fig: { kind: 'listPage', title: 'Accounts', rows: ['Checking', 'Savings', 'Credit'], caption: 'Grouped by type with a net-worth band on top.' } },
            ],
          },
          {
            id: 'reconcile',
            title: 'Reconcile an account',
            subtitle: 'Match Vaultr to your real balance',
            blocks: [
              { t: 'lead', text: 'Reconciling checks that Vaultr’s balance matches your bank. It happens inline on the account.' },
              { t: 'steps', items: [
                { title: 'Open the account', detail: 'Tap it on the Accounts page.' },
                { title: 'Enter your real (actual) balance', detail: 'Vaultr shows App balance, Actual and the Difference side by side.' },
                { title: 'Resolve the difference', detail: 'Add any missing transactions; the difference goes to zero.' },
              ] },
              { t: 'figure', fig: { kind: 'detail', title: 'Reconcile', rows: ['App balance', 'Actual', 'Difference'], caption: 'App vs Actual vs Difference, with the ledger below.' } },
            ],
          },
          {
            id: 'account-detail',
            title: 'Account detail & ledger',
            blocks: [
              { t: 'lead', text: 'Opening an account shows its running ledger (newest first), balance and quick actions.' },
              { t: 'list', items: [
                'Running balance column so you can trace every change.',
                'Edit the account, reconcile, or add a transaction to it.',
                'Credit cards additionally show statement and due-date info.',
              ] },
            ],
          },
          {
            id: 'customer-id',
            title: 'Bank Customer ID (CIF)',
            blocks: [
              { t: 'lead', text: 'You can store a Customer ID / CIF for each bank account and for each debit card, in the Bank Details tab.' },
              { t: 'p', text: 'It’s optional and only shown when you reveal account details.' },
            ],
          },
        ],
      },
      {
        label: 'Cards',
        articles: [
          {
            id: 'credit-cards',
            title: 'Credit cards & statements',
            blocks: [
              { t: 'lead', text: 'Add a credit card as an account of type Credit to track outstanding, limit, statement day and due date.' },
              { t: 'list', items: [
                'Credit limit and utilisation are shown on the card face.',
                'Statement day and due day drive reminders.',
                'Network (Visa/Mastercard/RuPay) and expiry can be stored.',
              ] },
              { t: 'callout', variant: 'warn', text: 'For security, the card CVV is never stored by Vaultr.' },
            ],
          },
          {
            id: 'debit-cards',
            title: 'Debit cards on an account',
            blocks: [
              { t: 'lead', text: 'A bank account can hold one or more debit cards, each with its own number, network, holder, expiry and Customer ID.' },
              { t: 'steps', items: [
                { title: 'Open the account form', detail: 'Add or edit a non-credit account.' },
                { title: 'Add debit card', detail: 'Use + Add debit card and fill the details.', action: '+ Add debit card' },
              ] },
            ],
          },
          {
            id: 'pay-card',
            title: 'Pay a credit card',
            blocks: [
              { t: 'lead', text: 'Record a payment towards a card from one of your accounts.' },
              { t: 'steps', items: [
                { title: 'Open the card', detail: 'From Accounts or Cards.' },
                { title: 'Use the pay action', detail: 'Choose the paying account and amount.' },
                { title: 'Save', detail: 'This posts a transfer and lowers the outstanding.' },
              ] },
            ],
          },
          {
            id: 'reveal-details',
            title: 'Reveal card / account numbers',
            blocks: [
              { t: 'lead', text: 'Sensitive numbers are masked by default; tap the eye icon on a card to reveal them briefly.' },
              { t: 'callout', variant: 'info', text: 'This per-card reveal is separate from the global Hide Balances toggle, which masks amounts app-wide.' },
            ],
          },
        ],
      },
    ],
  },
  // ══════════════════════════════════ INSIGHTS, BUDGETS & FORECAST ══════════════════════════════════
  {
    id: 'insights',
    label: 'Insights & budgets',
    icon: 'bar-chart-3',
    blurb: 'Understand where money goes and where it’s heading.',
    groups: [
      {
        label: 'Dashboards & analysis',
        articles: [
          {
            id: 'dashboard',
            title: 'The Home dashboard',
            blocks: [
              { t: 'lead', text: 'Home is your command centre: net worth, money in and out this month, and shortcuts to recent activity.' },
              { t: 'figure', fig: { kind: 'dashboard', title: 'Home', rows: ['Net worth', 'Money in', 'Money out'], caption: 'Top tiles summarise the month; cards below show recent activity.' } },
              { t: 'callout', variant: 'info', text: 'The eye toggle hides the tile figures for privacy.' },
            ],
          },
          {
            id: 'budgets',
            title: 'Budgets',
            subtitle: 'Set limits per category and track them',
            blocks: [
              { t: 'lead', text: 'Budgets let you cap spend per category and watch progress through the month.' },
              { t: 'steps', items: [
                { title: 'Open Insights', action: 'Sidebar → Insights' },
                { title: 'Set a budget per category', detail: 'Enter a monthly limit for the categories you care about.' },
                { title: 'Track progress', detail: 'Each budget shows spent vs limit; overspend is flagged.' },
              ] },
              { t: 'figure', fig: { kind: 'listPage', title: 'Insights', rows: ['Groceries — ₹28k / ₹30k', 'Marketing — ₹1.6L / ₹1.5L', 'Software — ₹29k / ₹40k'], caption: 'Budgets show spent against limit per category.' } },
            ],
          },
          {
            id: 'insights-analysis',
            title: 'Insights & spending breakdown',
            blocks: [
              { t: 'lead', text: 'The Insights hub breaks spending down by category and over time so trends are obvious.' },
              { t: 'list', items: [
                'Category breakdown for the selected period.',
                'Month-over-month comparison.',
                'Drill into a category to see its transactions.',
              ] },
            ],
          },
          {
            id: 'profitability',
            title: 'Profitability',
            blocks: [
              { t: 'lead', text: 'Profitability nets income against expenses to show whether you’re ahead, and by how much.' },
              { t: 'p', text: 'Use it to compare periods and spot months where costs outran revenue.' },
            ],
          },
          {
            id: 'forecast',
            title: 'Cashflow forecast',
            blocks: [
              { t: 'lead', text: 'Forecast projects your balance forward using recurring items and known bills, so you can see cash squeezes coming.' },
              { t: 'callout', variant: 'tip', text: 'Keep recurring transactions and bills up to date for the most accurate forecast.' },
            ],
          },
        ],
      },
    ],
  },
  // ══════════════════════════════════ CUSTOMERS & SALES ══════════════════════════════════
  {
    id: 'customers',
    label: 'Customers & sales',
    icon: 'users',
    blurb: 'Bill customers, track incoming payments and TDS.',
    groups: [
      {
        label: 'Customers',
        articles: [
          {
            id: 'customers-hub',
            title: 'Customers overview',
            blocks: [
              { t: 'lead', text: 'The Customers hub gathers everything about who you sell to: invoices, incoming payments, TDS and a directory.' },
              { t: 'figure', fig: { kind: 'listPage', title: 'Customers', tabs: ['Overview', 'Invoices', 'Incoming', 'TDS'], caption: 'Side tabs move between customer sub-screens.' } },
            ],
          },
          {
            id: 'customer-directory',
            title: 'Customer directory',
            blocks: [
              { t: 'lead', text: 'The directory holds each customer’s billing details — name, address and GSTIN — reused across invoices.' },
              { t: 'steps', items: [
                { title: 'Open Customers → Directory' },
                { title: 'Add a customer', detail: 'Capture GSTIN and address so invoices are compliant.', action: '+ Add customer' },
              ] },
            ],
          },
        ],
      },
      {
        label: 'Invoicing customers',
        articles: [
          {
            id: 'create-invoice',
            title: 'Create a customer invoice',
            blocks: [
              { t: 'lead', text: 'Raise a GST tax invoice with per-line items, HSN/SAC codes and automatic tax.' },
              { t: 'steps', items: [
                { title: 'Customers → Invoices → New invoice', action: 'New invoice' },
                { title: 'Pick company & customer', detail: 'Company sets the branding; customer sets who’s billed.' },
                { title: 'Add line items', detail: 'Description, HSN/SAC, qty, rate and GST rate per line.' },
                { title: 'Check the live preview', detail: 'The document updates as you type.' },
                { title: 'Save & generate PDF' },
              ] },
              { t: 'shot', shot: {
                chrome: 'browser', url: '/customers/invoices/new', nav: 'Customers',
                header: { title: 'New invoice' },
                items: [
                  { type: 'field', label: 'Company', value: 'Northstar Trading Pvt Ltd', pin: { n: 1, label: 'Sets branding, GSTIN & bank details' } },
                  { type: 'field', label: 'Customer', value: 'Acme Retail LLP', pin: { n: 2, label: 'Who is billed (address + GSTIN)' } },
                  { type: 'row', cells: ['Consulting — HSN 9983 · 18%', '10 × ₹5,000', '₹50,000'], strongFirst: true, pin: { n: 3, label: 'Per line: description, HSN/SAC, qty, rate, GST%' } },
                  { type: 'button', label: 'Save & generate PDF', primary: true, pin: { n: 4, label: 'Save' } },
                ],
                caption: 'Per-line HSN/SAC and GST rates are editable; the document preview updates live.',
              } },
            ],
          },
          {
            id: 'invoice-content',
            title: 'What’s on a tax invoice',
            subtitle: 'Every required field',
            blocks: [
              { t: 'lead', text: 'Vaultr’s tax invoice includes all the GST-required elements so it’s compliant out of the box.' },
              { t: 'list', items: [
                '“Tax Invoice” title, number and status.',
                'Company block with address, GSTIN, phone and email.',
                'Billed-to with customer address and GSTIN.',
                'Place of Supply and Ship-to GSTIN.',
                'Per-line HSN/SAC and CGST/SGST rates.',
                'Subtotal, CGST, SGST, Total and Balance Due.',
                'Total in words.',
                'Full bank details and Terms & Conditions.',
                'Authorised signature.',
              ] },
              { t: 'callout', variant: 'info', text: 'Terms & Conditions and bank details come from Setup → Company. Set them once and they appear on every invoice.' },
            ],
          },
          {
            id: 'invoice-templates-pick',
            title: 'Choosing an invoice template',
            blocks: [
              { t: 'lead', text: 'Each company can use a different invoice template and accent colour.' },
              { t: 'p', text: 'Templates and accents are chosen per company under Documents & templates. Newer invoices use the current design automatically.' },
            ],
          },
          {
            id: 'reimbursables',
            title: 'Reimbursable invoices',
            blocks: [
              { t: 'lead', text: 'Reimbursable invoices bill costs you paid on a customer’s behalf, kept separate from standard GST invoices.' },
              { t: 'steps', items: [
                { title: 'Customers → Reimbursables → new', action: 'New reimbursable' },
                { title: 'Add the reimbursable lines' },
                { title: 'Generate the document' },
              ] },
            ],
          },
          {
            id: 'mark-paid',
            title: 'Mark an invoice paid',
            blocks: [
              { t: 'lead', text: 'When payment arrives, mark the invoice paid to update outstanding totals.' },
              { t: 'steps', items: [
                { title: 'Open the invoice' },
                { title: 'Mark as paid', detail: 'Record the date and (optionally) the receiving account.', action: 'Mark paid' },
              ] },
            ],
          },
        ],
      },
      {
        label: 'Incoming & TDS',
        articles: [
          {
            id: 'incoming',
            title: 'Incoming payments',
            blocks: [
              { t: 'lead', text: 'The Incoming screen tracks money customers owe and what has come in, including commission where relevant.' },
            ],
          },
          {
            id: 'tds',
            title: 'TDS',
            subtitle: 'Tax deducted at source',
            blocks: [
              { t: 'lead', text: 'Where customers deduct TDS, record it so your receivable and tax credit reconcile.' },
              { t: 'p', text: 'Open Customers → TDS to view and record deductions against invoices.' },
            ],
          },
        ],
      },
    ],
  },
  // ══════════════════════════════════ SUPPLIERS & PURCHASES ══════════════════════════════════
  {
    id: 'suppliers',
    label: 'Suppliers & purchases',
    icon: 'building-2',
    blurb: 'Track what you buy, bills and payments to suppliers.',
    groups: [
      {
        label: 'Suppliers',
        articles: [
          {
            id: 'suppliers-hub',
            title: 'Suppliers overview',
            blocks: [
              { t: 'lead', text: 'The Suppliers hub covers invoices you receive, payments you make, what’s been billed, and a directory.' },
              { t: 'figure', fig: { kind: 'listPage', title: 'Suppliers', tabs: ['Overview', 'Invoices', 'Payments', 'Billed'], caption: 'Side tabs move between supplier sub-screens.' } },
            ],
          },
          {
            id: 'supplier-directory',
            title: 'Supplier directory',
            blocks: [
              { t: 'lead', text: 'Keep each supplier’s details in one place, reused across bills and payments.' },
              { t: 'steps', items: [
                { title: 'Open Suppliers → Directory' },
                { title: 'Add a supplier', action: '+ Add supplier' },
              ] },
            ],
          },
          {
            id: 'supplier-categories',
            title: 'Supplier categories',
            blocks: [
              { t: 'lead', text: 'Group suppliers into categories to analyse spend by type of vendor.' },
            ],
          },
        ],
      },
      {
        label: 'Bills & payments',
        articles: [
          {
            id: 'supplier-invoices',
            title: 'Supplier invoices (bills)',
            blocks: [
              { t: 'lead', text: 'Record invoices you receive so you know what you owe and when.' },
              { t: 'steps', items: [
                { title: 'Suppliers → Invoices → new', action: 'New bill' },
                { title: 'Enter supplier, amount, due date and category' },
                { title: 'Attach the original', detail: 'Keep the PDF or image with the record.' },
              ] },
            ],
          },
          {
            id: 'supplier-fetch',
            title: 'Fetch supplier invoices from email',
            subtitle: 'Inbox review',
            blocks: [
              { t: 'lead', text: 'Connect email and Vaultr surfaces supplier invoices from your inbox for review.' },
              { t: 'steps', items: [
                { title: 'Suppliers → Fetch', action: 'Suppliers → Fetch' },
                { title: 'Open an item', detail: 'The email is shown exactly, with attachments as paperclips you can open on the left if needed.' },
                { title: 'Confirm as a bill' },
              ] },
              { t: 'figure', fig: { kind: 'detail', title: 'Inbox review', rows: ['From', 'Subject', 'Amount'], caption: 'The email as-received, with attachments as paperclips.' } },
            ],
          },
          {
            id: 'supplier-payments',
            title: 'Payments',
            blocks: [
              { t: 'lead', text: 'Record what you’ve paid suppliers and against which bills.' },
              { t: 'p', text: 'Open Suppliers → Payments to log a payment and reconcile it against outstanding bills.' },
            ],
          },
          {
            id: 'supplier-billed',
            title: 'Billed',
            blocks: [
              { t: 'lead', text: 'The Billed view lists everything a supplier has invoiced you, paid and unpaid.' },
            ],
          },
          {
            id: 'bills-timeline',
            title: 'Bills timeline',
            blocks: [
              { t: 'lead', text: 'The Bills timeline lays out upcoming and overdue bills by date so nothing slips.' },
              { t: 'figure', fig: { kind: 'table', title: 'Bills', rows: ['BILL', 'DUE', 'AMOUNT', ''], caption: 'Upcoming and overdue bills, sorted by due date.' } },
            ],
          },
        ],
      },
    ],
  },
  // ══════════════════════════════════ PAYROLL & TEAM ══════════════════════════════════
  {
    id: 'payroll',
    label: 'Payroll & team',
    icon: 'calendar-clock',
    blurb: 'Run payroll, issue slips and manage employees.',
    groups: [
      {
        label: 'Payroll',
        articles: [
          {
            id: 'payroll-run',
            title: 'Run payroll for a month',
            blocks: [
              { t: 'lead', text: 'Payroll processes a month at a time: earnings, deductions and net pay per employee.' },
              { t: 'steps', items: [
                { title: 'Open Payroll', action: 'Sidebar → Payroll' },
                { title: 'Open the month to process', action: 'Payroll → Processing' },
                { title: 'Review each employee', detail: 'Basic, allowances, overtime, incentives, deductions and advances.' },
                { title: 'Mark paid', detail: 'Record the payment date; slips become available.' },
              ] },
              { t: 'figure', fig: { kind: 'table', title: 'Payroll · processing', rows: ['EMPLOYEE', 'GROSS', 'NET', ''], caption: 'One row per employee for the month.' } },
            ],
          },
          {
            id: 'salary-slips',
            title: 'Salary slips',
            subtitle: 'What each slip shows',
            blocks: [
              { t: 'lead', text: 'Each processed month produces a per-employee salary slip you can print or share.' },
              { t: 'list', items: [
                'Employee name, ID, designation, PAN and date of joining.',
                'Earnings: Basic, Allowances, Overtime, Incentives → Gross.',
                'Deductions: Deductions and Advance → Total.',
                'Net pay, plus net pay in words.',
                'Bank name, full account number and IFSC.',
                'Source salary and FX rate where pay is in another currency.',
              ] },
              { t: 'callout', variant: 'info', text: 'Open Payroll → Slips to view and print slips for a month.' },
            ],
          },
          {
            id: 'payroll-history',
            title: 'Payroll history',
            blocks: [
              { t: 'lead', text: 'History keeps every processed month so you can revisit or reprint past runs.' },
            ],
          },
          {
            id: 'staff-pay',
            title: 'Staff & salary setup',
            blocks: [
              { t: 'lead', text: 'Set each employee’s salary and currency so payroll can compute pay each month.' },
              { t: 'p', text: 'Salary details live with the employee record; changes apply to future runs.' },
            ],
          },
        ],
      },
      {
        label: 'Organization',
        articles: [
          {
            id: 'employees',
            title: 'Employees',
            blocks: [
              { t: 'lead', text: 'The employee record holds identity, role, bank and pay details, and links to a company.' },
              { t: 'steps', items: [
                { title: 'Organization → Employees', action: 'Organization → Employees' },
                { title: 'Add an employee', detail: 'Name, ID, designation, PAN, joining date and bank details.', action: '+ Add employee' },
              ] },
            ],
          },
          {
            id: 'contracts',
            title: 'Contracts',
            blocks: [
              { t: 'lead', text: 'Generate employment contracts from a per-company template, filling in employee variables automatically.' },
              { t: 'steps', items: [
                { title: 'Organization → Contracts', action: 'Organization → Contracts' },
                { title: 'Pick an employee and generate', detail: 'Variables like name, role and salary are filled in.' },
              ] },
            ],
          },
          {
            id: 'job-descriptions',
            title: 'Job descriptions',
            blocks: [
              { t: 'lead', text: 'Create and store job descriptions alongside contracts for each role.' },
            ],
          },
        ],
      },
    ],
  },
  // ══════════════════════════════════ DOCUMENTS & TEMPLATES ══════════════════════════════════
  {
    id: 'documents',
    label: 'Documents & templates',
    icon: 'file-text',
    blurb: 'Branding and templates for invoices, slips and contracts.',
    groups: [
      {
        label: 'Templates',
        articles: [
          {
            id: 'templates-hub',
            title: 'Templates hub',
            blocks: [
              { t: 'lead', text: 'The Templates hub is where you design and assign the look of every document type.' },
              { t: 'figure', fig: { kind: 'listPage', title: 'Templates', tabs: ['Invoices', 'Salary slips', 'Contracts'], caption: 'One place for all document designs.' } },
            ],
          },
          {
            id: 'invoice-designer',
            title: 'Invoice templates & accent',
            blocks: [
              { t: 'lead', text: 'Assign a template and accent colour per company; the accent drives the grand-total and highlights on the invoice.' },
              { t: 'steps', items: [
                { title: 'Open Templates → Invoices' },
                { title: 'Pick a layout and accent' },
                { title: 'Assign it to a company' },
              ] },
              { t: 'callout', variant: 'info', text: 'Changing a template affects new documents; existing PDFs keep the design they were generated with.' },
            ],
          },
          {
            id: 'salary-slip-designer',
            title: 'Salary slip templates',
            blocks: [
              { t: 'lead', text: 'Salary slips can be branded per company, using your logo, name, address and accent.' },
            ],
          },
          {
            id: 'contract-templates',
            title: 'Contract templates',
            blocks: [
              { t: 'lead', text: 'Contracts use a per-company template with variables that fill from the employee record when you generate.' },
            ],
          },
        ],
      },
      {
        label: 'Branding',
        articles: [
          {
            id: 'company-branding',
            title: 'Company logo, address & bank',
            blocks: [
              { t: 'lead', text: 'Everything that appears on documents — logo, address, GSTIN, bank details, signature and terms — comes from the company record.' },
              { t: 'steps', items: [
                { title: 'Setup → Company', action: 'Setup → Company' },
                { title: 'Upload logo and signature' },
                { title: 'Fill bank details and Terms & Conditions', detail: 'These flow onto every invoice automatically.' },
              ] },
            ],
          },
          {
            id: 'design-versions',
            title: 'Classic vs new designs',
            blocks: [
              { t: 'lead', text: 'Vaultr keeps older document designs intact so past documents don’t change, while new ones use the latest layout.' },
              { t: 'callout', variant: 'info', text: 'All the legal content (HSN/SAC, GST breakdown, terms, bank details, signature) is present in both designs — only the visual layout differs.' },
            ],
          },
        ],
      },
    ],
  },
  // ══════════════════════════════════ SETUP, DATA & SETTINGS ══════════════════════════════════
  {
    id: 'setup',
    label: 'Setup, data & settings',
    icon: 'settings',
    blurb: 'Configure the workspace, manage data and privacy.',
    groups: [
      {
        label: 'Setup',
        articles: [
          {
            id: 'company-details',
            title: 'Company',
            blocks: [
              { t: 'lead', text: 'Your company profile: legal name, address, GSTIN, contact details, logo, signature, bank details and terms.' },
              { t: 'figure', fig: { kind: 'setup', title: 'Company', rows: ['Company', 'Email', 'Categories', 'Account types', 'Currencies'], highlight: 'Company', caption: 'Setup uses a two-pane layout; Company is the first section.' } },
            ],
          },
          {
            id: 'email-setup',
            title: 'Email connection',
            blocks: [
              { t: 'lead', text: 'Connect an inbox so Vaultr can fetch bank alerts and supplier invoices.' },
              { t: 'steps', items: [
                { title: 'Setup → Email', action: 'Setup → Email' },
                { title: 'Follow the connection steps' },
                { title: 'Confirm fetching works', detail: 'Check Transactions → Fetch and Suppliers → Fetch.' },
              ] },
            ],
          },
          {
            id: 'categories',
            title: 'Categories',
            blocks: [
              { t: 'lead', text: 'Categories group transactions for budgets and insights. Income and expense have separate lists.' },
              { t: 'steps', items: [
                { title: 'Setup → Categories', action: 'Setup → Categories' },
                { title: 'Add a category', detail: 'Give it a name, colour and emoji.', action: '+ New category' },
                { title: 'Reorder by dragging' },
              ] },
              { t: 'figure', fig: { kind: 'setup', title: 'Categories', rows: ['Company', 'Email', 'Categories', 'Account types', 'Currencies'], highlight: 'Categories', caption: 'Category cards with colour and emoji, grouped by income/expense.' } },
            ],
          },
          {
            id: 'account-types-setup',
            title: 'Account types',
            blocks: [
              { t: 'lead', text: 'Rename or recolour built-in account types, and create, edit or delete custom ones.' },
              { t: 'callout', variant: 'tip', text: 'You can also create a custom type on the fly from the account form — see Accounts & cards → Account types.' },
            ],
          },
          {
            id: 'currencies',
            title: 'Currencies',
            blocks: [
              { t: 'lead', text: 'Manage the currencies you use, for foreign accounts and cross-currency salaries.' },
            ],
          },
          {
            id: 'reconcile-settings',
            title: 'Reconcile settings',
            blocks: [
              { t: 'lead', text: 'Tune how reconciliation behaves across accounts from this settings pane.' },
            ],
          },
        ],
      },
      {
        label: 'Data & account',
        articles: [
          {
            id: 'export-backup',
            title: 'Export & backup',
            blocks: [
              { t: 'lead', text: 'Download your data for backup or accounting from the Downloads screen.' },
              { t: 'steps', items: [
                { title: 'Setup → Downloads', action: 'Setup → Downloads' },
                { title: 'Choose an export', detail: 'Export transactions or a full backup.' },
              ] },
            ],
          },
          {
            id: 'subscriptions',
            title: 'Subscriptions',
            blocks: [
              { t: 'lead', text: 'Track recurring subscriptions so they’re visible in cashflow and budgets.' },
            ],
          },
          {
            id: 'privacy-security',
            title: 'Privacy & security',
            blocks: [
              { t: 'lead', text: 'Vaultr is built to keep sensitive data safe.' },
              { t: 'list', items: [
                'Hide Balances masks every amount app-wide with one tap.',
                'Card and account numbers are masked until you reveal them.',
                'Card CVV is never stored.',
              ] },
              { t: 'callout', variant: 'warn', text: 'Reveals are momentary and per-item; the global toggle is the fastest way to hide everything in a shared space.' },
            ],
          },
        ],
      },
    ],
  },
]
