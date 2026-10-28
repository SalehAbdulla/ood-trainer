# Practical Drill 3 — UML Sequence Diagram (EA)

**Target time: 15–20 minutes per scenario.** Maps to `WK4_2_1`, `WK6_2_1 Task 1`.

---

## EA setup

1. EA → **New Project** → save as e.g. `WK4_2_1`. **Click CANCEL** on the Model Wizard.
2. Double-click **Model** and rename it (e.g. `SMS`).
3. Click the model root → **New Package** → name it after the scenario (`Create Student`) → **Package Only**.
4. Right-click the package → **Add Diagram** → **UML Behaviour** → **Sequence** → OK.
5. Drag **Lifelines** onto the canvas and name them.
6. Add messages between lifelines, in order, top to bottom. Add **alt** / **opt** / **loop** combined fragments for conditions.
7. One package per scenario — `Create Student`, `Read Student`, `Update Student`, `Delete Student` — all inside the same model.

---

## The four lifeline stereotypes — memorise these

| Lifeline | Stereotype | Example |
|---|---|---|
| `User` | **Actor** | the registrar / staff member |
| `StudentUI` | **Boundary** | the form / screen |
| `StudentController` | **Control** | the logic that coordinates |
| `StudentDB` | **Entity / Database** | persistence |

Everything below uses this same four-lifeline shape. If a question says *"the user does X"*, you can almost always answer with Actor → Boundary → Control → Entity.

---

## Reading order rule

A sequence diagram is read **top to bottom** because **time progresses downward**.
It describes: **WHO → does WHAT → to WHOM → and in WHAT ORDER**.

---

## Drill 3A — SMS: Create Student — 10 min

**Scenario.** The user inputs student details and the system validates by showing that the operation is successful or unsuccessful due to some error saving the data in the database.

**Model answer — message sequence**

1. `User → StudentUI` : `enterStudentDetails()`
2. `StudentUI → StudentController` : `createStudent(data)`
3. `StudentController → StudentDB` : `insert(data)`
4. `StudentDB → StudentController` : `result(success, newId)`  *(return, dashed)*
5. **alt** `[success]` `StudentController → StudentUI` : `showConfirmation(newId)`
   **else** `StudentController → StudentUI` : `showError(...)`

**Self-mark (8)**
- [ ] Four lifelines with correct stereotypes (2)
- [ ] Messages in the correct order (2)
- [ ] One return message drawn dashed (1)
- [ ] `alt` fragment with `[success]` and `[else]` guards (2)
- [ ] Message names include arguments in the C#-style form `name(args)` (1)

---

## Drill 3B — SMS: Read Student — 10 min

**Scenario.** The user searches for a student by ID to view their profile.

**Model answer**

1. `User → StudentUI` : `search(studentId)`
2. `StudentUI → StudentController` : `getStudent(studentId)`
3. `StudentController → StudentDB` : `findById(studentId)`
4. `StudentDB → StudentController` : `studentRecord | null`  *(return)*
5. **alt** `[studentRecord != null]` `StudentController → StudentUI` : `showProfile(studentRecord)`
   **else** `StudentController → StudentUI` : `showNotFound(studentId)`
6. `StudentUI → User` : `displayResult()`

**Self-mark (6)**
- [ ] Four lifelines (2)
- [ ] Ordered messages (2)
- [ ] `alt` with a null-check guard (2)

---

## Drill 3C — SMS: Update Student — 12 min

**Scenario.** The user edits a student's email address. Include an optional pre-check on whether the student exists.

**Model answer**

1. `User → StudentUI` : `submitEdit(studentId, newEmail)`
2. `StudentUI → StudentController` : `updateEmail(studentId, newEmail)`
3. `StudentController → StudentDB` : `updateEmail(studentId, newEmail)`
4. `StudentDB → StudentController` : `updateResult(rowsAffected)`
5. **alt**
   - `[rowsAffected = 1]` `StudentController → StudentUI` : `showConfirmation()`
   - `[else]` `StudentController → StudentUI` : `showError("Update failed or no changes")`
6. `StudentUI → User` : `displayResult()`

*Optional pre-check (nested alt):* `StudentController → StudentDB` : `exists(studentId)` → returns `true|false`; use a **nested alt**: `[exists]` proceed; `[else]` show "Not found".

**Self-mark (8)**
- [ ] Ordered messages with the right arguments (2)
- [ ] Return message `updateResult(rowsAffected)` drawn dashed (1)
- [ ] `alt` with `[rowsAffected = 1]` and `[else]` (2)
- [ ] Final `displayResult()` back to the actor (1)
- [ ] Optional pre-check modelled as a **nested alt** (2)

---

## Drill 3D — SMS: Delete Student — 10 min

**Scenario.** The user deletes a student record after confirmation.

**Model answer**

1. `User → StudentUI` : `delete(studentId)`
2. `StudentUI → StudentController` : `deleteStudent(studentId)`
3. **opt** (confirmation) `StudentController → StudentUI` : `confirm("Are you sure?")` → User confirms
4. `StudentController → StudentDB` : `deleteById(studentId)`
5. `StudentDB → StudentController` : `deleteResult(rowsAffected)`  *(return)*
6. **alt**
   - `[rowsAffected = 1]` `StudentController → StudentUI` : `showConfirmation()`
   - `[else]` `StudentController → StudentUI` : `showError("Not found / constraint")`
7. `StudentUI → User` : `displayResult()`

**Self-mark (8)**
- [ ] Ordered messages (2)
- [ ] **`opt`** (not `alt`) used for the optional confirmation (2)
- [ ] **`alt`** used for the success/failure outcome (2)
- [ ] Return message present (1)
- [ ] `displayResult()` back to the actor (1)

---

## Drill 3E — Magic Home Appliances: Add Receipt (exam simulation) — 25 min

**Scenario (R1: Add).** Managers can manage receipt details (add, edit, delete, search). Draw a **formal** sequence diagram for the Add scenario, with messages written in C#-style syntax. All messages are **synchronous** except the last one to the Manager, which is **asynchronous**.

**Lifelines:** `Manager` (Actor), `ReceiptUI` (Boundary), `ReceiptController` (Control), `ReceiptDB` (Entity/DB).

**Model answer — main flow**

1. `Manager → ReceiptUI` ▸ `addReceipt() : void`
2. `ReceiptUI → ReceiptController` ▸ `InitNewReceipt() : ReceiptDto`
3. `ReceiptController → ReceiptDB` ▸ `GenerateNextReceiptNo() : int`
4. `ReceiptDB → ReceiptController` *(return)* `int  // nextReceiptNo`
5. `ReceiptController → ReceiptUI` ▸ `ShowAddForm(seed: ReceiptDto) : void`
6. `Manager → ReceiptUI` ▸ `enterDetails(dto: ReceiptDto) : void` — (customerId, washerIds[], date, warranty, installDate, totals, cashierId, etc.)
7. `ReceiptUI → ReceiptController` ▸ `Validate(dto: ReceiptDto) : ValidationResult`
8. `ReceiptController → ReceiptDB` ▸ `CheckCustomerExists(customerId: int) : bool`
9. `ReceiptController → ReceiptDB` ▸ `CheckWashersAvailable(washerIds: int[]) : bool`
10. `ReceiptController → ReceiptUI` ▸ `ShowValidation(result: ValidationResult) : void`
11. `ReceiptUI → ReceiptController` ▸ `CreateReceipt(dto: ReceiptDto) : int  // newReceiptId`
12. `ReceiptController → ReceiptDB` ▸ `Insert(dto: ReceiptDto) : int  // affectedRows`
13. `ReceiptDB → ReceiptController` *(return)* `int`
14. `ReceiptController → ReceiptUI` ▸ `ShowConfirmation(receiptId: int) : void`
15. `ReceiptUI → Manager` ▷ **`displaySuccess("Receipt created.") : void`** — **asynchronous**

**Minimal alternates — put these in `alt` fragments**

| Guard | Message |
|---|---|
| `[!customerExists]` after step 8 | `ReceiptController → ReceiptUI` : `Error("Customer not found.")` |
| `[!washersAvailable]` after step 9 | `ReceiptController → ReceiptUI` : `Error("Selected washing machine(s) not available.")` |
| `[ValidationResult.HasErrors]` after step 10 | `ReceiptUI → Manager` ▷ `displayError(listOfIssues)` |
| `[affectedRows == 0]` after step 13 | `ReceiptController → ReceiptUI` : `Error("Save failed. Please try again.")` |

**Self-mark (15)**
- [ ] Four lifelines with the correct stereotypes (2)
- [ ] Messages in the correct order (3)
- [ ] Return messages drawn dashed (2)
- [ ] All messages carry a **return type** (`: void`, `: int`, `: bool`, `: ReceiptDto`) (2)
- [ ] Synchronous arrows (filled head) used throughout (1)
- [ ] The final message to the Manager is **asynchronous** (open head) (2)
- [ ] All four `alt` fragments with correct guards (3)

---

## Combined fragment cheat sheet

| Fragment | Meaning | Example guard |
|---|---|---|
| `alt` | Alternative paths — if / else | `[rowsAffected = 1]` … `[else]` |
| `opt` | Optional interaction — only-if | `[customer has coupon]` |
| `loop` | Repeated interaction | `[for each item in cart]` |

---

## Sequence self-check before you move on

1. Are the lifelines in the **Actor → Boundary → Control → Entity** order, left to right?
2. Does every message have **arguments and a return type** written above the arrow?
3. Is every return drawn **dashed**?
4. Did you use `opt` for something **optional** and `alt` for something **conditional** (if/else)?
5. Does the diagram read correctly **top to bottom**?
6. Is the final "display to the user" message drawn **asynchronous** (open arrowhead)?

---

## Speed tip for the exam

Draw the **four lifelines first**, always in the same order. Then write the messages as numbered sentences before drawing arrows — that way even if you run out of time, the marker can see the correct order and the correct argument names, which is where most of the marks are.

