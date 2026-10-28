# Practical Drill 2 — UML Use Case Diagram (EA)

**Target time: 20 minutes per drill.** Maps to `WK4_1_1`, `WK4_1_2`, `WK6_1_1 Task 2`.

---

## EA setup

1. EA → **New Project** → save as e.g. `WK4_1_1`.
2. **Click CANCEL** when the Model Wizard pops up.
3. Project Browser → click **MODEL** on the root → **New Package**.
4. Package name `HMS`, Owner `Model`, Initial Content = **Package Only** → OK.
5. Right-click the package → **Add Diagram** → left pane **UML Behaviour** → right pane **Use Case** → OK.
6. Toolbox: **Actor**, **Use Case**, **System Boundary** (from Common), **Association**, **Generalization**, **Dependency** (set the stereotype to `include` or `extend` in Properties → General).

---

## The rules you must not get wrong

| Rule | Detail |
|---|---|
| **Association** | Actor ↔ Use Case only. **Never** Use Case ↔ Use Case |
| **Generalization** | Between actors, and between use cases |
| **Dependency** | Between use cases: `<<include>>` and `<<extend>>` |
| `<<include>>` | **Mandatory.** Base use case *always* needs it. Arrow points **to the included use case**. "Must do" |
| `<<extend>>` | **Optional/conditional.** Base can happen without it. Arrow points **to the base use case**. "May do" |
| **Actor** | Always **outside** the system boundary. Can be a person, another system, an organisation or a device |
| **Use case names** | Verb/goal, e.g. `Login`, `Make Payment` — **not** `Login Page`, `Database` |

---

## Drill 2A — Hotel Management System — 20 min

**Business case.** A hotel management system allows guests to rent rooms. A receptionist assists the guest with the room rental process. Guests can also book a room for future stays with the assistance of a receptionist. Before making a booking, the system must check whether the room has already been booked. When a guest checks out, the guest must make a payment for the room. The guest can choose one of the following payment methods: cash, cheque or credit card. Before a receptionist can use the hotel management system, the receptionist must log in using a username and password. The system performs username and password verification before allowing the receptionist to access the system.

**Your deliverable:** actors, system boundary, use cases, and relationships.

**Model answer**

- **Actors:** Guest, Receptionist
- **System boundary:** Hotel Management System
- **Use cases:**
  1. `Log in` (Receptionist — requires Username/Password Verification)
  2. `Rent Room` (Guest, assisted by Receptionist)
  3. `Book Room` (Guest → Receptionist → system checks prior booking)
  4. `Check Availability` (before booking)
  5. `Check Out` (Guest)
  6. `Make Payment` (Guest selects one of `Pay by Cash`, `Pay by Cheque`, `Pay by Credit Card`)
- **Relationships:**
  - Receptionist — `Log in`, with `<<include>>` → `Username/Password Verification`
  - Guest — `Rent Room` (assisted by Receptionist)
  - `Book Room` — `<<include>>` → `Check Availability`
  - `Check Out` — `<<include>>` → `Make Payment`
  - `Make Payment` — **generalized** into three alternate methods: Cash / Cheque / Credit Card

**Self-mark (12)**
- [ ] Actors Guest + Receptionist, drawn outside the boundary (2)
- [ ] System boundary labelled (1)
- [ ] All six use cases as ovals with verb names (3)
- [ ] Association lines actor→use case only (1)
- [ ] `Log in` includes Username/Password Verification with the arrow pointing **at** the included use case (2)
- [ ] `Book Room` includes `Check Availability` (1)
- [ ] `Check Out` includes `Make Payment` (1)
- [ ] Payment generalised into Cash / Cheque / Credit Card (1)

---

## Drill 2B — Hospital Management System — 25 min

**Business case.** When patients visit or call, the receptionist logs in to the system using a secure username and password. From there, the receptionist can add, edit, delete or view appointment details depending on the patient's request. Meanwhile, new patients can create their own accounts online, where they can update personal information and manage their upcoming appointments. The system also allows the receptionist to manage patient accounts in case updates or corrections are needed. Once an appointment is successfully scheduled, the system automatically sends a confirmation message to the patient containing the appointment date and time. All users — including patients and receptionists — are required to log in before accessing their accounts and log out after completing their tasks to maintain system security.

**Model answer**

- **Actors:** Receptionist, Patient
- **System boundary:** Hospital Management System
- **Use cases:** `Log in`; `Log out`; `Add Appointment`; `Edit Appointment`; `Delete Appointment`; `View Appointment`; `Create Account`; `Update Personal Information`; `Manage Appointments`; `Manage Patient Accounts`; `Send Appointment Confirmation`
- **Relationships:**
  - Receptionist — `Log in` (`<<include>>` → `Username/Password Verification`), `Log out`, `Add/Edit/Delete/View Appointment`, `Manage Patient Accounts`
  - Patient — `Create Account`, `Update Personal Information`, `Manage Appointments`, `Log in`, `Log out`
  - `Add/Edit/Delete/View Appointment` — `<<include>>` → `Log in` (mandatory before access)
  - `Schedule Appointment` — `<<include>>` → `Send Appointment Confirmation` (always sent after successful scheduling)

**Self-mark (12)**
- [ ] Both actors outside the boundary (2)
- [ ] `Log in` and `Log out` as separate use cases (2)
- [ ] All four CRUD appointment use cases (2)
- [ ] Patient self-service use cases (Create Account, Update Info, Manage Appointments) (2)
- [ ] `Log in` included by the protected use cases (2)
- [ ] `Send Appointment Confirmation` modelled as an include of scheduling (2)

---

## Wording decoder — this is where the marks hide

| Phrase in the scenario | What it means in the diagram |
|---|---|
| "must log in before…" / "all users are required to log in" | `<<include>>` Log in |
| "automatically sends…" / "the system must check…" | `<<include>>` (a mandatory system step) |
| "if the guest has a coupon…" / "under certain conditions" | `<<extend>>` |
| "can choose one of: cash / cheque / card" | **Generalization** of the payment use case into three child use cases |
| "assisted by", "managed by" | a second actor with an association to the same use case |
| "customer, admin, staff, manager all log in" | **Actor generalization** to a common `User` actor |

---

## Drill 2C — Magic Home Appliances Store (exam simulation) — 25 min

**Scenario.** A washing machine store wants a software solution. Requirements derived by the analysis team:

- **R1)** Managers can manage receipt details (add, edit, delete, search)
- **R2)** All users can log in and log out (with username and password verification)
- **R3)** Manager can manage customer accounts
- **R4)** System sends warranty expiration details after purchase
- **R5)** Customer can manage their accounts online

**Model answer**

- **Actors:** Manager, Cashier, Customer. (All generalise to a common `User` for `Log in` / `Log out` — actor generalization removes the repeated associations.)
- **System boundary:** Magic Home Appliances Ordering System
- **Use cases mapped to requirements:**
  - R1 → `Add Receipt`, `Edit Receipt`, `Delete Receipt`, `Search Receipt`
  - R2 → `Log in`, `Log out` (both `<<include>>` → `Username/Password Verification`), plus `Generate Report`
  - R3 → `Manage Customer Accounts`
  - R4 → `Send Warranty Expiration Notification` — `<<include>>` of the purchase/`Add Receipt` flow (it always happens after purchase)
  - R5 → `Manage Account Online`
- **Relationships:**
  - `User` (generalized actor) — `Log in`, `Log out`; `Manager` and `Cashier` inherit these
  - Manager — Add/Edit/Delete/Search Receipt, Manage Customer Accounts, Generate Report
  - Cashier — `Add Receipt` (issues the receipt)
  - Customer — `Manage Account Online`
  - `Add Receipt` — `<<include>>` → `Send Warranty Expiration Notification`

**Self-mark (15)**
- [ ] Actors identified: Manager, Cashier, Customer (3)
- [ ] Actor generalization to a common `User` for login/logout (2)
- [ ] All four CRUD receipt use cases from R1 (3)
- [ ] `Log in` / `Log out` as use cases with `<<include>>` verification (2)
- [ ] `Manage Customer Accounts` (R3) (1)
- [ ] Warranty notification modelled as an include of the purchase flow (R4) (2)
- [ ] `Manage Account Online` (R5) (1)
- [ ] System boundary drawn and labelled (1)

---

## Use Case self-check before you move on

Ask these five questions about your diagram:

1. Is every **actor outside** the boundary?
2. Is every **association** actor→use case (never use case→use case)?
3. Does every use case name describe an **action or goal** (no screens, no databases)?
4. For each `<<include>>`, is the arrow pointing **at the included** use case?
5. For each `<<extend>>`, is the arrow pointing **at the base** use case, and is the behaviour genuinely optional?

