# Practical Drill 4 — Design Patterns (EA + selection)

**Target time: 15 min per pattern diagram, 10 min for a selection question.**
Maps to `WK5_1_1`, `WK5_1_2`, `WK5_2_1`, `WK5_2_2`, `WK5_2_3`, `WK6_2_1 Task 2`.

---

## The 30-second pattern picker (memorise this table)

| Key words in the scenario | Pattern | Category |
|---|---|---|
| only one instance; single config manager; one logger | **Singleton** | Creational |
| create the correct object **at runtime** from a choice; easy to extend with new types | **Factory Method** | Creational |
| **clone / copy** an existing complex object; expensive to build from scratch | **Prototype** | Creational |
| build **step by step**; many optional parts; same process, different results | **Builder** | Creational |
| two **incompatible interfaces**; integrate without changing either side | **Adapter** | Structural |
| notify **many subscribers** automatically when state changes; one-to-many | **Observer** | Behavioural |

**Justification formula (say all three parts):**
1. **Name** the pattern.
2. **The design problem** in the scenario's own words.
3. **The benefit** — extensibility / decoupling / reuse / no modification of existing code.

---

## Drill 4A — Factory Method: Smart Coffee Ordering — 15 min

**Scenario.** A café wants to automate preparation of Espresso, Latte and Cappuccino. Originally: `if (order == "Espresso") coffee = new Espresso(); else if (order == "Latte") ...; else if (order == "Cappuccino") ...` — rigid, violates the Open-Closed Principle.

**Classes to add**
- `Coffee` (abstract class)
- `Espresso`, `Latte`, `Cappuccino`
- `CoffeeFactory` (abstract class)
- `ConcreteCoffeeFactory`

**Relationships**
- `Espresso`, `Latte`, `Cappuccino` → **inherit from** `Coffee` *(Realization arrow in EA)*
- `ConcreteCoffeeFactory` → **inherits from** `CoffeeFactory` *(Generalization arrow)*
- `ConcreteCoffeeFactory` → **creates** `Coffee` objects *(Dependency link with stereotype `«creates»`)*

**Extension task.** Add a new coffee type **Mocha** without rewriting the existing logic for Espresso/Latte/Cappuccino. → add `Mocha` as a subclass of `Coffee` and register it in the factory; **no change to the client**.

**Add a note:** *"The Factory Method allows the system to create coffee objects dynamically based on customer choice."*

**Self-mark (10)**
- [ ] `Coffee` is an **abstract** class (name in italics) (2)
- [ ] Three concrete products inherit from `Coffee` using Realization (2)
- [ ] `CoffeeFactory` abstract + `ConcreteCoffeeFactory` via Generalization (2)
- [ ] `«creates»` dependency from factory to product (2)
- [ ] Note added (1)
- [ ] Mocha added **without** modifying existing classes (1)

---

## Drill 4B — Prototype: Fantasy RPG Character Cloning — 15 min

**Scenario.** Players choose and customise Warrior, Archer and Mage characters. A new character should be a **clone of a predefined template** instead of being built from scratch.

**Classes / interfaces to add**
- `ICharacter` `<<interface>>`
- `Warrior`, `Archer`, `Mage`
- `Equipment`
- `CharacterRegistry`

**Relationships**
- `Warrior`, `Archer`, `Mage` **realize** `ICharacter` *(Realization arrow)*
- `CharacterRegistry` → `ICharacter` **Dependency** with stereotype `«clones»` *(Properties → Stereotype = clones)*
- `Warrior`/`Archer`/`Mage` → `Equipment`: **Association** with multiplicity `0..1` and role `weapon/gear`

**Extension task.** Add a concrete class `Rogue` with agility, stealth and weapon attributes. Then:
- Display the inherited methods and **override** `clone()`: Operation → select `clone()` → expand **Advanced** → **Override = True**.
- Register the prototype: double-click `CharacterRegistry` → **Operations** → `register` → **Behavior** tab → type `register("StealthRogue", new(/* preset stats + dagger */))` → tick **Show Behavior in Diagram** → Save and Close.

**Self-mark (10)**
- [ ] `ICharacter` drawn as an interface (2)
- [ ] Three (then four) products realize it (2)
- [ ] `CharacterRegistry` dependency with `«clones»` stereotype (2)
- [ ] Association to `Equipment` with multiplicity `0..1` and a role name (2)
- [ ] `clone()` shown as an override on `Rogue` (1)
- [ ] `register(...)` behaviour added to the registry (1)

---

## Drill 4C — Builder: Motorcycle Assembly — 15 min

**Scenario.** Al Alawi Motorcycle Manufacturing wants to assemble Sport Bike, Cruiser and Dirt Bike step by step, sharing a similar construction process but differing in engine, frame and tyres.

**Relationships**
- `Director` ⇒ **uses** `IMotorcycleBuilder` *(association labelled `uses`)*
- `SportBikeBuilder`, `CruiserBuilder`, `DirtBikeBuilder` ⇒ **realize** `IMotorcycleBuilder` *(dashed triangle arrow)*
- Each builder ⇒ **creates** a `Motorcycle` *(association labelled `builds`)*
- `Motorcycle` ⇒ **composed of** `Part` *(composition arrow — filled diamond)*

**Extension task.** Add `ElectricBikeBuilder` that builds an electric motorcycle **without modifying the Director class**. → proof that Builder satisfies the Open-Closed Principle.

**Add a note:** *"The Builder Pattern constructs complex objects (like motorcycles) step-by-step, allowing different bike types to be built using the same assembly process."*

**Self-mark (10)**
- [ ] `IMotorcycleBuilder` interface + three builders realizing it (3)
- [ ] `Director` association labelled `uses` (2)
- [ ] Builder → `Motorcycle` association labelled `builds` (2)
- [ ] `Motorcycle` composition to `Part` with a **filled** diamond (2)
- [ ] `ElectricBikeBuilder` added with the Director unchanged (1)

---

## Drill 4D — Adapter: Payment System Integration — 15 min

**Scenario.** Al Hadad Company's e-commerce system was designed to process payments using a standard interface `IPaymentGateway`. The company partnered with a third-party provider whose system uses a different API. A `PaymentAdapter` converts calls from `IPaymentGateway` into methods the third-party provider understands — **without modifying the existing system**.

**Relationships**
1. `PaymentAdapter` **realizes** `IPaymentGateway` — Realization (dashed line + hollow triangle), drawn from `PaymentAdapter` → `IPaymentGateway`.
2. `PaymentAdapter` **uses** `ThirdPartyPaymentAPI` — Association (solid line), **navigability from Adapter to API only**.
3. `ECommerceSystem` **depends on** `IPaymentGateway` — Dependency (dashed arrow), labelled `uses`.

**Add a note:** *"The PaymentAdapter converts ProcessPayment() calls from the E-Commerce System into MakeTransaction() calls on the ThirdPartyPaymentAPI, enabling seamless integration."*

**Self-mark (8)**
- [ ] `IPaymentGateway` interface present (1)
- [ ] `PaymentAdapter` realizes it with a **dashed + hollow triangle** (2)
- [ ] Association to `ThirdPartyPaymentAPI` with **one-way navigability** (2)
- [ ] `ECommerceSystem` dependency labelled `uses` (2)
- [ ] Note added (1)

---

## Drill 4E — Observer: Order Status Notification — 15 min

**Scenario.** An e-commerce platform's `OrderService` updates an order's status (`PLACED → PAID → SHIPPED → DELIVERED`). Whenever the status changes, all subscribed services must react automatically: `EmailService` (emails), `SmsService` (SMS), `OpsDashboard` (live dashboard), `LoyaltyService` (credits points on DELIVERED).

**Relationships**
- `OrderService` **generalizes** `Subject` *(solid line, hollow triangle)*
- Each `ConcreteObserver` **realizes** `Observer` *(dashed line, hollow triangle)*
- Each `ConcreteObserver` has a **navigable association** to `OrderService` (they "know" the subject to pull details if needed)

**Add a note to `OrderService`:** *"On SetStatus(), Notify() is called; observers receive (orderId, newStatus) and react independently."*

**Self-mark (10)**
- [ ] `Subject` with `Attach()`, `Detach()`, `Notify()` (2)
- [ ] `OrderService` generalizes `Subject` (2)
- [ ] `Observer` interface with `Update()` (2)
- [ ] Four concrete observers realize `Observer` (2)
- [ ] Each observer has a navigable association back to `OrderService` (1)
- [ ] Note added (1)

---

## Drill 4F — Pattern selection (the Week 6 Task 2 exam question) — 10 min

Answer each in **brief but concise** form, naming the pattern **and justifying it**.

| # | Scenario |
|---|---|
| 1 | A meal-kit service lets customers pick a base (vegan/seafood/chicken) then add sides, sauces and dessert. The kitchen must assemble each box **step-by-step** based on the chosen options. |
| 2 | A weather platform **pushes alerts** (heat wave, sandstorm, flooding) to **many endpoints** — mobile apps, SMS gateways, campus dashboards — whenever conditions change. |
| 3 | A new analytics engine consumes events as **JSON**, but an older sensor gateway only emits **CSV** lines. Integrate them **without changing either system**. |
| 4 | A travel app lets users choose a transport ticket: bus, metro or ferry. Create the correct ticket object **at runtime** based on the selection, and be **easy to extend**. |
| 5 | An online whiteboard needs to **duplicate complex shapes** (nested styles, connectors, constraints) quickly so users can make variations **without reconstructing from scratch**. |

**Model answer**

1. **Builder** — assemble a meal box step by step (base, sides, sauces, dessert) with a builder/director to ensure valid combinations.
2. **Observer** — the weather service (subject) notifies multiple subscribers (apps, SMS, dashboards) whenever alerts change.
3. **Adapter** — wrap the CSV-emitting gateway with an adapter that exposes the JSON interface the analytics engine expects.
4. **Factory Method** — create the correct ticket object (Bus/Metro/Ferry) at runtime; easy to add new ticket types later.
5. **Prototype** — clone complex shapes to duplicate them quickly, then tweak the copies without rebuilding from scratch.

**Self-mark (15)**
- [ ] 1 mark per correct pattern name (5)
- [ ] 2 marks per justification that mentions the design problem **and** the benefit (10)

---

## Extra selection scenarios — drill until it is instant

| Scenario | Pattern |
|---|---|
| One `ConfigurationManager` must be shared by the whole application | Singleton |
| An application logger writing to one file | Singleton |
| Build a `Computer` with optional CPU, RAM, storage, graphics card | Builder |
| Duplicate a `Document` or `Report` that took a long time to build | Prototype |
| Different `Notification` types (Email, SMS, Push) each implement `send()` | Factory Method |
| An `Appointment` must update a Patient and a Receptionist differently | Observer |
| A `PaymentAdapter` must expose `IPaymentGateway` over a third-party API | Adapter |
| Add a new payment type without touching the main ordering logic | Factory Method |
| A UI must refresh whenever an underlying model changes | Observer |
| Integrate a legacy class whose method is `processTransaction()` into a client expecting `Pay()` | Adapter |

---

## Pattern self-check before you move on

1. Is the **abstract/interface** element actually marked as such (italic name / `<<interface>>`)?
2. Did you use **Realization** (dashed + hollow triangle) for interfaces and **Generalization** (solid + hollow triangle) for class inheritance?
3. Are the **stereotype labels** present — `«creates»`, `«clones»`, `uses`, `builds`?
4. Did you add the **note** the task asked for?
5. For the extension task, did you add the new class **without modifying** the existing client/Director?

