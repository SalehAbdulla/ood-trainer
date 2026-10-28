# Practical Drill 1 — UML Class Diagram (EA)

**Weight in exam:** part of the 40% practical. **Target time: 20 minutes per drill.**
Everything here maps to `WK2_1_1`, `WK2_2_1`, `WK3_1_1 → WK3_1_4` and `WK6_1_1`.

---

## EA setup (do this first, every time)

1. EA → **New Project** → save as e.g. `Wk3_1_1`.
2. Model Wizard → **Core Modelling** → **UML 2** → tick **Domain Model** (and Class/Use Case if needed) → OK.
3. Open the **Domain Objects** diagram.
4. **Set the Language to C#** before adding any class (double-click the diagram background → Elements → Language → C#).
5. Toolbox → **Class** to add a class. Double-click the class → **Features & Properties** → add Attributes and Operations.
6. Add connectors from the toolbox: **Association**, **Aggregation**, **Composition**, **Generalization**, **Realization**, **Dependency**.
7. Right-click a connector → **Properties** → set **GENERAL** (name/type, source→destination) and **ROLE(S)** (role name + multiplicity).
8. Save, then **Code Engineering → Generate Source Code** to produce the `.cs` files.

---

## Drill 1A — University System (aggregation + association class) — 20 min

**Scenario.** A university system represents students, courses, departments and lecturers.

| Class | Attributes |
|---|---|
| Student | studentID, name |
| Course | code, title, capacity |
| Department | departmentID, departmentName |
| Enrollment | enrollmentDate, grade, status |
| Lecturer | lecturerID, name |

**Tasks**
1. Create all five classes in EA (Language = C#).
2. Create an **association** between Student and Course.
3. Make **Enrollment an Association Class** on that association: right-click Enrollment → **Advanced → Association Class** → select the Student–Course connector → OK. A dashed connector is drawn automatically.
4. Create an **aggregation** between Department and Lecturer (the lecturer can transfer to another department). Hollow diamond on the **Department** side.
5. Multiplicities: Lecturer→Department = `1..*`; Department→Lecturer = `1`.
6. Save as `WK3_1_1`, generate source code, inspect in Visual Studio.

**Self-mark (10)**
- [ ] All 5 classes present with correct attributes (1)
- [ ] Language set to C# (0.5)
- [ ] Student–Course association drawn and named (1)
- [ ] Enrollment attached as an **association class** with a **dashed** connector (2)
- [ ] Aggregation (hollow diamond) between Department and Lecturer (2)
- [ ] Hollow diamond is on the **Department** (whole) side (1)
- [ ] Multiplicities `1..*` and `1` set correctly (1.5)
- [ ] Source code generated and inspected (1)

**Why aggregation, not composition?** The lecturer is an independent part — if the department closes, the lecturer still exists and can teach in another department. The part's lifecycle is *not* tied to the whole.

---

## Drill 1B — Online Shopping System (association + composition) — 20 min

**Scenario.** An online shopping system with customers, orders, order items and a shopping cart.

| Class | Attributes |
|---|---|
| Customer | customerID, name, email |
| Order | orderID, orderDate, status |
| OrderItem | orderItemId, quantity, unitPrice, subtotal |
| ShoppingCart | cartID |

**Tasks**
1. Create the four classes.
2. **Association** Customer → Order, named `places`. Multiplicity at the Order end = `0..*`; at the Customer end = `1`. Meaning: *Customer 1 — places — 0..* Order*.
3. **Composition** Order → OrderItem, named `contains`. Order→OrderItem = `1..*`; OrderItem→Order = `1`. Filled diamond on the **Order** side.
4. **Association** Customer → ShoppingCart, named `has`, multiplicity `1` at both ends.
5. Save as `WK3_1_2`, generate source code.

**Self-mark (10)**
- [ ] Four classes with correct attributes (1.5)
- [ ] Customer–Order association named `places` (1)
- [ ] Multiplicities `1` and `0..*` the right way round (2)
- [ ] Order–OrderItem **composition** with **filled** diamond (2)
- [ ] Multiplicities `1..*` and `1` (1.5)
- [ ] Customer–ShoppingCart association named `has`, `1` at both ends (1)
- [ ] Source code generated (1)


---

## Drill 1C — Polymorphism / abstract class (payment system) — 15 min

**Scenario.** An e-commerce platform supports Credit Card, PayPal and Benefit Payment. Each processes payments differently but shares a common interface.

**Tasks**
1. Add class `PaymentMethod`.
2. Make it **abstract**: right-click → Properties → **Details** tab → tick **Abstract**. The class name turns *italic*.
3. Add an abstract operation: right-click → **Features & Properties → Operations** → name `processPayment`, Return Type `void`, set **Abstract = True**, Parameters tab → `amount` : `double`. The operation name turns *italic*.
4. Add `CreditCardPayment`, `PayPalPayment`, `BenefitPayment` and connect each to `PaymentMethod` using **Generalization**.
5. Add a **Note** to each concrete class describing its behaviour.
6. Optional: add `Customer` with `makePayment(amount : double) : void` and an association to `PaymentMethod`.

**Self-mark (8)**
- [ ] `PaymentMethod` is abstract (class name in italics) (2)
- [ ] `processPayment(amount : double) : void` marked abstract (2)
- [ ] Three concrete subclasses present (1)
- [ ] Three **Generalization** arrows, triangle pointing at `PaymentMethod` (2)
- [ ] Notes attached (1)

**Exam tip.** Any question that says *"each X processes Y differently but shares a common interface"* is asking for: **abstract base class + Generalization + overridden method**. Same shape for `EnrollmentMethod` → `OnlineEnrollment`, `OnCampusEnrollment`, `AgentEnrollment`.

---

## Drill 1D — Interfaces (multiple realization) — 15 min

**Scenario.** A Smart Home System: devices can turn on/off and some can connect to Wi-Fi. `SmartLight` can turn on/off. `SmartSpeaker` can turn on/off *and* connect to Wi-Fi.

**Tasks**
1. Toolbox → Class → **Interface**. Create `IPowerControl` with `TurnOn()`, `TurnOff()`.
2. Create `IWifiEnabled` with `ConnectToWifi()`.
3. Create classes `SmartLight` and `SmartSpeaker`.
4. Connect using **Realization** (dashed line + hollow triangle): `SmartLight` → `IPowerControl`; `SmartSpeaker` → `IPowerControl` **and** → `IWifiEnabled`.

**Self-mark (6)**
- [ ] Two interfaces with the correct operations (2)
- [ ] Interfaces drawn as `<<interface>>` classifiers (1)
- [ ] Realization (dashed + hollow triangle), **not** generalization (2)
- [ ] `SmartSpeaker` realizes **two** interfaces (1)

**Animal drill (same skill).** `IMovable.Move()`, `IFlyable.Fly()`, `ISwimmable.Swim()`; Dog → IMovable + ISwimmable; Bird → IMovable + IFlyable; Duck → all three.

---

## Drill 1E — Full-system class diagram (exam simulation) — 25 min

**Scenario — Magic Home Appliances Store.** A washing machine store needs a system design.

- Washing machines: **Top-Load Washers** (energy-saving modes), **Front-Load Washers** (bundled with installation kits), **Smart Washers** (mobile app connectivity). Each has ID, brand, model name, capacity (kg), dimensions, features, price.
- Customers may purchase **one or more** washing machines in a single transaction. Each customer has name, age, CPR, unique ID.
- Transactions are facilitated by the **Manager**; payments are handled by a **Cashier** who issues receipts. Manager and Cashier have employee ID, name, username, password.
- The receipt includes customer ID, washing machine IDs, date and time of purchase, warranty, installation details, total amount.
- Managers generate reports (number, model name sold, total sales).

**Deliverable.** A **domain class diagram** with class names, attributes, association connectors (including directed association), **role names** and **multiplicity**.

**Self-mark (15)**
- [ ] `Customer`, `Manager`, `Cashier` modelled; `Manager`/`Cashier` generalised to an `Employee`/`User` parent (username, password) (3)
- [ ] `WashingMachine` parent with `TopLoad`, `FrontLoad`, `Smart` subclasses (Generalization) (3)
- [ ] `Receipt` class with all listed attributes (2)
- [ ] `Customer` 1 — `0..*` `Receipt` (or Purchase) with role names (2)
- [ ] `Receipt` composed of `1..*` `WashingMachine` lines (composition) (2)
- [ ] `Report` class with an association to `WashingMachine`/`Receipt` (1)
- [ ] Multiplicities on every association end (1)
- [ ] Role names present on associations (1)

---

## Common EA mistakes that lose marks

| Mistake | Fix |
|---|---|
| Using **Generalization** for an interface | Use **Realization** (dashed line + hollow triangle) |
| Diamond on the wrong end | The diamond always sits on the **whole** side |
| Hollow vs filled diamond mixed up | Hollow = Aggregation (parts survive). Filled = Composition (parts die with the whole) |
| Triangle pointing at the child | It points at the **parent/base** class |
| Multiplicity on the wrong end | Read it aloud: "**One** Customer places **0..\*** Orders" — the `0..*` goes at the Order end |
| Forgetting `name : type` on attributes | UML attribute syntax is `[visibility] [name] : [type]` |
| Forgetting to set Language = C# | Set it before adding classes, or code generation fails |
| No role names / no association names | The Week 6 task explicitly asks for role names |

