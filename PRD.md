# PRD: Interview Knowledge Compiler

## 1. Product Overview

### Product Name
**Interview Knowledge Compiler**

### One-line Pitch
An AI-powered interview preparation notebook that turns raw practice notes into structured knowledge, mistake tracking, review maps, and personalized next-step study plans.

### Product Vision
Most interview preparation tools help users collect resources, solve questions, or track progress. However, they do not help users maintain and evolve their knowledge over time. As users prepare for coding interviews, system design interviews, and behavioral interviews, their notes often become fragmented, repetitive, and hard to review.

Interview Knowledge Compiler solves this by converting messy raw notes into a living, structured interview knowledge base. The product helps users identify patterns, update existing knowledge, track recurring mistakes, and generate focused review plans.

The goal is not to create more notes. The goal is to make each practice session improve the user's future preparation.

---

## 2. Problem Statement

Interview preparation produces many types of information:

- LeetCode reflections
- Algorithm patterns
- Mistake notes
- System design mock feedback
- Architecture trade-offs
- Behavioral stories
- Company-specific interview notes
- Job descriptions
- Resume feedback

Traditional note-taking tools store this information, but they do not maintain it. Over time, users face several problems:

1. **Notes become stale**  
   Old conclusions and summaries are not updated when users learn better approaches.

2. **Knowledge becomes fragmented**  
   Similar insights are scattered across many problem notes or practice logs.

3. **Patterns are hard to extract manually**  
   Users solve many problems, but they do not always convert mistakes into reusable knowledge.

4. **Review becomes inefficient**  
   Before interviews, users do not know which notes are most important to revisit.

5. **Different interview areas require different structures**  
   Coding, system design, and behavioral preparation cannot be organized using the same note format.

---

## 3. Target Users

### Primary User
Software engineering candidates preparing for technical interviews.

This includes:

- New graduates
- Junior to mid-level engineers
- Career switchers
- International students preparing for software roles
- Developers preparing for FAANG-style or product company interviews

### Secondary User
People preparing for structured professional interviews that include technical and behavioral components.

---

## 4. User Goals

Users want to:

- Capture practice reflections quickly without overthinking structure
- Understand what patterns they are weak at
- Turn mistakes into future review actions
- Build reusable coding pattern notes
- Maintain system design trade-off knowledge
- Build a behavioral story bank
- Know what to practice next
- Review efficiently before interviews

---

## 5. Product Principles

### 5.1 Raw Notes Can Be Messy
Users should be able to write naturally, for example:

> I did not recognize this was an all-pairs shortest path problem. Need more practice with Floyd-Warshall.

The system should handle messy input and extract structure.

### 5.2 Compiled Knowledge Must Stay Clean
The product should not simply generate more notes. It should maintain a small number of high-value structured notes.

### 5.3 Problem Notes Are Evidence, Not the Main Knowledge Unit
For LeetCode, the main knowledge units should be patterns, algorithms, mistakes, and review maps, not individual problems.

### 5.4 Different Interview Domains Need Different Schemas
Coding, system design, and behavioral interviews should use different compiled structures.

### 5.5 AI Should Suggest, Not Silently Overwrite
The user should review and approve important updates before they are written into the knowledge base.

---

## 6. Core Concept

The product uses a two-layer knowledge model:

### Layer 1: Raw Practice Notes
Raw notes are the user's original thoughts, reflections, mistakes, and feedback.

Examples:

- LeetCode problem reflection
- System design mock interview feedback
- Behavioral story draft
- Company interview notes

Raw notes are append-only and preserve the user's original context.

### Layer 2: Compiled Knowledge
Compiled knowledge is structured, cleaned, and maintained by the AI.

Examples:

- Coding pattern notes
- Algorithm review maps
- Mistake logs
- System design trade-off notes
- Behavioral story bank
- Global readiness map

---

## 7. MVP Scope

### MVP Goal
Validate whether users find value in turning raw interview practice notes into structured, reviewable knowledge and next-step recommendations.

### MVP Focus
The MVP should support three preparation domains:

1. Coding / LeetCode
2. System Design
3. Behavioral Questions

However, the first MVP implementation can start with Coding and add System Design and Behavioral as extensions.

---

## 8. Key User Flows

## 8.1 Coding Practice Flow

### User Input
The user writes a raw LeetCode reflection.

Example:

> 1334. Find the City With the Smallest Number of Neighbors at a Threshold Distance  
> This problem requires all-pairs shortest path. I realized it should use Floyd-Warshall. I was not familiar with this pattern and need more practice.

### AI Processing
The system extracts:

- Problem name and number
- Primary pattern
- Algorithm
- Recognition signal
- Key insight
- Mistake
- Missing knowledge
- Review action
- Related notes

### AI Suggested Updates
The system proposes updates such as:

1. Create or update problem note
2. Link to `All-Pairs Shortest Path`
3. Link to `Floyd-Warshall`
4. Add mistake: did not recognize all-pairs shortest path
5. Add review task: practice 2 more shortest path problems

### User Action
The user can:

- Approve all updates
- Edit suggested updates
- Reject updates

---

## 8.2 Review Map Flow

### User Input
The user creates or updates a review note, such as:

```text
Shortest Path
1. Weight = 1 => BFS
2. Weight > 0 => Dijkstra
3. Negative weights => Bellman-Ford
4. All pairs => Floyd-Warshall
```

### AI Processing
The system identifies this as a `Review Map`, not a problem note.

### AI Behavior
The system should:

- Preserve this as a high-level decision guide
- Link it to individual algorithm notes
- Suggest corrections if needed
- Avoid adding every related problem into the review map
- Keep the note concise

### Example Suggested Correction

The AI may suggest:

> Change “Weight has negative or cycle” to “Negative edge weights → Bellman-Ford; negative cycles can be detected by one extra relaxation pass.”

---

## 8.3 System Design Practice Flow

### User Input
The user writes feedback from a system design mock interview.

Example:

> I practiced URL Shortener. I explained the API and database schema, but I forgot capacity estimation and did not clearly explain collision handling.

### AI Processing
The system extracts:

- Case study: URL Shortener
- Components mentioned
- Missing components
- Trade-offs
- Mistakes
- Review actions

### AI Suggested Updates

1. Update `URL Shortener` case study
2. Update `Key Generation` component note
3. Add mistake: forgot capacity estimation
4. Add mistake: weak collision handling explanation
5. Add review task: redo URL Shortener with scale assumptions

---

## 8.4 Behavioral Practice Flow

### User Input
The user writes a behavioral story or mock feedback.

Example:

> I talked about a team project delay. I explained that I helped split tasks and adjust the schedule, but my answer sounded too vague and did not include measurable impact.

### AI Processing
The system extracts:

- Story title
- Competencies
- STAR structure
- Missing details
- Weaknesses
- Possible questions this story can answer

### AI Suggested Updates

1. Create or update `Team Project Delay Recovery` story
2. Add competencies: ownership, communication, leadership
3. Add weakness: result not quantified
4. Suggest a 60-second version
5. Link story to questions about conflict, leadership, and pressure

---

## 9. Knowledge Structure

## 9.1 Coding Knowledge Structure

```text
/interview/coding
  /raw-problems
  /patterns
  /algorithms
  /mistakes
  /review-maps
```

### Problem Note Schema

```text
Problem:
Difficulty:
Pattern:
Algorithm:
Recognition Signal:
Key Insight:
Mistake:
Missing Knowledge:
Implementation Detail:
Review Action:
Linked Notes:
Confidence:
```

### Pattern Note Schema

```text
Pattern Name:
When to Use:
Core Idea:
Recognition Signals:
Template:
Common Mistakes:
Representative Problems:
Variants:
Related Patterns:
```

### Review Map Schema

```text
Review Map Name:
Core Question:
Decision Rules:
Common Traps:
Representative Problems:
Linked Algorithms:
Last Updated:
```

---

## 9.2 System Design Knowledge Structure

```text
/interview/system-design
  /case-studies
  /components
  /tradeoffs
  /frameworks
  /mistakes
  /review-maps
```

### Case Study Schema

```text
Design Problem:
Problem Scope:
Functional Requirements:
Non-functional Requirements:
Capacity Estimation:
API Design:
Data Model:
High-Level Architecture:
Key Components:
Key Trade-offs:
Failure Modes:
My Mistakes:
Follow-up Questions:
Review Actions:
```

### Trade-off Note Schema

```text
Trade-off:
When It Appears:
Option A:
Option B:
Pros and Cons:
Decision Rule:
Example Case Studies:
Common Mistakes:
```

---

## 9.3 Behavioral Knowledge Structure

```text
/interview/behavioral
  /stories
  /competencies
  /questions
  /story-maps
  /mistakes
```

### Story Schema

```text
Story Title:
Competencies:
Situation:
Task:
Action:
Result:
Strongest Evidence:
Can Answer:
Weaknesses:
30-second Version:
60-second Version:
2-minute Version:
```

### Competency Map Schema

```text
Competency:
Available Stories:
Strongest Story:
Missing Evidence:
Weakness:
Practice Action:
```

---

## 10. Global Readiness Map

The product should maintain a global readiness map across all interview areas.

### Example

```text
Coding
- Graph shortest path: Medium
- Stack with state: Weak
- Dynamic programming state definition: Weak
- Sliding window: Strong

System Design
- Capacity estimation: Weak
- Cache trade-offs: Medium
- Database schema explanation: Strong
- Failure modes: Weak

Behavioral
- Conflict story: Weak
- Leadership story: Medium
- Failure story: Missing
- Impact quantification: Weak
```

### Purpose
The readiness map answers:

> What should I practice next to become interview-ready?

---

## 11. AI Update Proposal System

Every time the user adds a new raw note, the AI should generate an update proposal.

### Proposal Format

```text
Detected Domain:
Detected Knowledge Type:
Related Existing Notes:
Suggested Updates:
Review Actions:
Confidence:
Needs User Approval:
```

### Example

```text
Detected Domain: Coding
Detected Knowledge Type: Problem Reflection
Related Existing Notes:
- Shortest Path Decision Guide
- Floyd-Warshall
- Graph Pattern Recognition Mistakes

Suggested Updates:
1. Add problem note for 1334
2. Add 1334 as representative Floyd-Warshall problem
3. Add mistake: did not recognize all-pairs shortest path
4. Add review task: practice 2 APSP problems

Confidence: High
Needs User Approval: Yes
```

---

## 12. Note Cleanliness Rules

To prevent the knowledge base from becoming messy, compiled notes should follow strict rules.

### 12.1 Raw Notes Can Grow
Raw notes preserve original context and can grow indefinitely.

### 12.2 Compiled Notes Must Stay Bounded
Compiled notes should be concise and limited.

Example limits:

- Max 5 recognition signals per pattern
- Max 5 common mistakes per pattern
- Max 8 representative problems per pattern
- Max 3 variants per pattern before creating sub-notes

### 12.3 Avoid Duplicate Patterns
Before creating a new pattern, the AI should check whether the insight belongs to an existing pattern.

### 12.4 Promote Patterns Slowly
A new pattern should only be created when multiple examples support it.

### 12.5 Archive Low-value Details
If a detail is useful but not central, it should remain in the raw note or archived evidence, not the main review note.

---

## 13. MVP Features

### Must Have

1. Raw note input
2. Domain classification
3. Structured extraction
4. AI update proposal
5. User approval before writing updates
6. Coding problem note generation
7. Pattern / algorithm linking
8. Mistake log
9. Review task generation
10. Global readiness map

### Should Have

1. Review map support
2. System design case study schema
3. Behavioral story schema
4. Weekly readiness report
5. Search across notes
6. Manual editing of compiled notes

### Could Have

1. Spaced repetition scheduling
2. Calendar-based study plan
3. Company-specific preparation mode
4. Resume-to-interview gap analysis
5. Mock interview feedback import
6. GitHub or Markdown export
7. Notion integration

### Won't Have in MVP

1. Full collaborative workspace
2. Real-time multiplayer editing
3. Full IDE integration
4. Automatic LeetCode submission import
5. Video interview analysis

---

## 14. Functional Requirements

### FR1: Raw Note Capture
Users can create raw notes for coding, system design, behavioral, or general interview preparation.

### FR2: Domain Detection
The system detects whether a note belongs to:

- Coding
- System Design
- Behavioral
- Company / Role
- General Reflection

### FR3: Knowledge Extraction
The system extracts structured fields based on domain-specific schemas.

### FR4: Related Knowledge Retrieval
The system finds related existing notes, such as patterns, mistakes, review maps, and stories.

### FR5: Update Proposal Generation
The system generates suggested updates before modifying compiled knowledge.

### FR6: User Approval
Users can approve, reject, or edit proposed updates.

### FR7: Compiled Knowledge Update
Approved updates are written into the relevant compiled notes.

### FR8: Mistake Tracking
The system maintains a mistake log grouped by domain and category.

### FR9: Review Task Generation
The system generates next-step review actions based on mistakes and weak areas.

### FR10: Readiness Map
The system maintains a global readiness map showing strengths, weaknesses, and missing preparation areas.

---

## 15. Non-functional Requirements

### NFR1: Trust and Transparency
The system must show why it suggests each update.

### NFR2: Editability
Users must be able to manually edit all compiled notes.

### NFR3: Reversibility
Users should be able to view update history and revert AI updates.

### NFR4: Data Portability
Notes should be exportable as Markdown.

### NFR5: Low Friction
Raw note capture should be fast and flexible.

### NFR6: Privacy
Interview notes, job search information, and behavioral stories may contain personal data. The product should treat this data as private by default.

---

## 16. Success Metrics

### Activation Metrics

- Percentage of users who create at least 3 raw notes
- Percentage of users who approve at least 1 AI update proposal
- Time from raw note input to structured update proposal

### Engagement Metrics

- Weekly active users
- Number of raw notes created per week
- Number of approved updates per week
- Number of review tasks completed

### Quality Metrics

- User acceptance rate of AI update proposals
- User edit rate before approval
- Number of duplicate notes created
- Reduction in repeated mistakes over time

### Outcome Metrics

- User-reported interview readiness improvement
- Number of weak areas resolved
- Number of completed mock interviews
- Number of interviews passed or callbacks received, if user chooses to track this

---

## 17. Example End-to-End Scenario

### Step 1: User Adds Raw Note

```text
1209. Remove All Adjacent Duplicates in String II
This problem was easier than expected. I did not realize I could use a counter with a stack. Store [char, count], increment count, and pop when count reaches k. Also remember not to use tuple because tuple is immutable.
```

### Step 2: AI Extracts Knowledge

```text
Problem: 1209. Remove All Adjacent Duplicates in String II
Pattern: Stack with State
Recognition Signal: adjacent duplicate removal with count threshold
Key Insight: stack can store [char, count]
Mistake: did not think of augmenting stack with counter
Implementation Detail: use mutable list instead of tuple if count needs updates
Review Action: practice stack-with-counter problems
```

### Step 3: AI Suggests Updates

```text
Suggested Updates:
1. Create problem note for 1209
2. Update Stack with State pattern note
3. Add mistake to Mistake Log
4. Add review task: practice 2 stack-with-state problems
```

### Step 4: User Approves
The system updates compiled knowledge.

### Step 5: Readiness Map Updates

```text
Coding Weak Areas:
- Stack with State: Weak → Medium
- Mutable vs Immutable Data Structures: Needs Review
```

---

## 18. Risks and Mitigations

### Risk 1: AI Creates Too Many Notes
**Mitigation:** Use bounded compiled notes and strict pattern promotion rules.

### Risk 2: AI Misclassifies Knowledge
**Mitigation:** Show update proposals and require approval for meaningful changes.

### Risk 3: Users Do Not Trust AI Updates
**Mitigation:** Provide explanation, source note links, and change history.

### Risk 4: Product Becomes Too Broad
**Mitigation:** Start with coding preparation, then expand to system design and behavioral.

### Risk 5: Notes Still Become Messy
**Mitigation:** Separate raw notes from compiled knowledge and include periodic cleanup suggestions.

---

## 19. Suggested MVP Roadmap

### Phase 1: Coding Knowledge Compiler

- Raw LeetCode note input
- Pattern extraction
- Mistake extraction
- Review task generation
- Coding readiness map

### Phase 2: Review Maps

- Algorithm decision guides
- Pattern review notes
- Pre-interview coding review sheet

### Phase 3: System Design Compiler

- Case study schema
- Trade-off notes
- System design mistake log
- System design readiness map

### Phase 4: Behavioral Compiler

- Story bank
- STAR structure extraction
- Competency map
- Behavioral readiness map

### Phase 5: Unified Interview Readiness Dashboard

- Combined readiness map
- Weekly plan
- Pre-interview brief
- Company-specific preparation mode

---

## 20. Open Questions

1. Should the first version be a standalone app or a Markdown/Notion-based workflow?
2. Should users manually approve every update, or only high-impact updates?
3. How should confidence scores be calculated?
4. Should the product include spaced repetition from the start?
5. Should raw notes be immutable?
6. Should users be able to define their own schemas?
7. How much structure should be shown to users versus handled internally?

---

## 21. Recommended MVP Positioning

### Product Category
AI interview preparation knowledge base

### Positioning Statement
For software engineering candidates who prepare across coding, system design, and behavioral interviews, Interview Knowledge Compiler is an AI-powered preparation notebook that converts raw practice notes into structured knowledge, mistake tracking, review maps, and personalized study plans. Unlike traditional note-taking apps or question banks, it continuously maintains the user's interview knowledge and helps them understand what to practice next.

### MVP Tagline
**Turn every practice session into interview-ready knowledge.**


---

## 22. Knowledge Update Policy

The product should not update compiled knowledge every time a raw note is added. The AI must decide whether the new input is worth integrating into the long-term knowledge base.

### 22.1 Update Philosophy

Raw notes are allowed to grow freely, but compiled knowledge should only change when the new information improves future preparation.

The system should prefer:

- Linking over duplicating
- Updating existing notes over creating new notes
- Preserving raw context over rewriting user intent
- Asking for approval before high-impact updates

### 22.2 When to Update

The AI should suggest an update when the raw note contains one or more of the following:

- A new reusable insight
- A repeated mistake
- A pattern recognition failure
- A useful implementation detail
- A correction to an existing note
- A system design trade-off weakness
- A behavioral story gap
- A company-specific interview requirement
- Evidence that a readiness status should change

### 22.3 When Not to Update

The AI should not update compiled notes when:

- The raw note does not contain a new insight
- The insight is already covered by an existing compiled note
- The note is too vague to classify confidently
- The information is problem-specific and not reusable
- The information is low confidence or speculative
- The detail belongs only in the raw note
- The update would make a compiled note too long or repetitive

### 22.4 Canonical Note Ownership Rules

Each extracted insight should have one primary home.

```text
Personal recurring error       -> Mistake Log
Reusable coding idea           -> Pattern / Algorithm Note
Language-specific detail       -> Language / Implementation Note
Problem-specific observation   -> Problem Note
Algorithm selection rule       -> Review Map
System design decision         -> Trade-off Note
System design practice result  -> Case Study / Rubric
Behavioral example             -> Story Bank
Behavioral skill gap           -> Competency Map
Company-specific requirement   -> Company Mode
```

The same idea can be linked from multiple places, but it should not be duplicated in full across multiple notes.

---

## 23. Update Impact Levels

Every AI update proposal should include an impact level. This helps users understand how much the AI wants to change.

```text
Level 0: Save raw note only
Level 1: Add links to existing notes
Level 2: Add mistake or review task
Level 3: Update existing compiled note
Level 4: Create new compiled note
Level 5: Merge, split, archive, or restructure notes
```

### 23.1 Approval Rules

```text
Level 0: No approval needed
Level 1: Auto-suggest, low risk
Level 2: User approval recommended
Level 3: User approval required
Level 4: User approval required
Level 5: Explicit user confirmation required
```

### 23.2 Example: Coding

For a LeetCode note where the user did not recognize Floyd-Warshall:

```text
Impact: Level 2
Suggested updates:
- Save raw problem note
- Link to Floyd-Warshall
- Add mistake: did not recognize all-pairs shortest path
- Add review task: practice APSP problems
Do not update Shortest Path Review Map because the rule already exists.
```

### 23.3 Example: System Design

For a mock interview where the user forgot capacity estimation:

```text
Impact: Level 3
Suggested updates:
- Update URL Shortener case study
- Add mistake: skipped capacity estimation
- Update System Design Readiness Map
```

---

## 24. Readiness Scoring Model

The product should avoid fake precision. Instead of numeric scores, the MVP should use simple readiness statuses.

### 24.1 Readiness Statuses

```text
Missing       -> No usable knowledge or practice evidence exists
Weak          -> User has attempted this area but repeatedly struggles
Needs Review  -> User has learned it before but has not practiced recently
Okay          -> User can usually handle it with minor issues
Strong        -> User can perform confidently and explain clearly
```

### 24.2 Coding Readiness Signals

Coding readiness should be based on:

- Recent attempts
- Whether the user solved independently
- Time taken
- Number of hints needed
- Repeated mistakes
- Ability to explain the pattern
- Ability to recognize the pattern in new problems

### 24.3 System Design Readiness Signals

System design readiness should be based on:

- Requirement clarification quality
- Capacity estimation quality
- API design clarity
- Data model quality
- Architecture structure
- Trade-off explanation
- Bottleneck analysis
- Failure mode coverage
- Communication clarity

### 24.4 Behavioral Readiness Signals

Behavioral readiness should be based on:

- Whether a story exists for the competency
- Whether the story follows STAR or CARL structure
- Whether the user's personal action is clear
- Whether the result is specific and measurable
- Whether the story can be delivered in different lengths
- Whether the story sounds authentic

### 24.5 Status Change Rules

Example rules:

```text
Weak -> Okay:
- User succeeds in 2 recent related practices with minimal help

Okay -> Strong:
- User succeeds repeatedly and can clearly explain reasoning

Strong -> Needs Review:
- No recent practice within the decay window

Any status -> Weak:
- Repeated recent mistakes appear in the same area
```

---

## 25. Staleness and Review Decay

Interview knowledge should decay over time if it is not practiced. The system should detect stale knowledge and suggest review.

### 25.1 Decay by Domain

```text
Coding patterns: decay faster
System design concepts: medium decay
Behavioral stories: slower decay, but require rehearsal
Company-specific notes: high decay because interview information changes quickly
```

### 25.2 Suggested Default Decay Windows

```text
Coding:
- 14 days without practice: Strong -> Needs Review
- 30 days without practice: Needs Review -> Weak

System Design:
- 21 days without practice: Strong -> Needs Review
- 45 days without practice: Needs Review -> Weak

Behavioral:
- 30 days without rehearsal: Strong -> Needs Review
- 60 days without rehearsal: Needs Review -> Weak

Company-Specific:
- 14 days without update: Needs verification
```

### 25.3 Staleness Indicators

The system should flag a note as stale when:

- It has not been reviewed recently
- It conflicts with newer practice feedback
- It has not been used successfully in practice
- It is linked to repeated mistakes
- It contains outdated company or role information

---

## 26. Evidence Linking

Every important compiled knowledge item should be traceable back to raw evidence.

### 26.1 Evidence Types

```text
Self reflection
LeetCode attempt
Mock interview feedback
Real interview feedback
Company job description
Company interview note
Resume review
Manual user correction
```

### 26.2 Evidence Metadata

Each evidence link should include:

```text
Source note
Date
Domain
Confidence
Impact level
User approval status
```

### 26.3 Example

```text
Mistake:
Did not recognize all-pairs shortest path.

Evidence:
- 1334. Find the City With the Smallest Number of Neighbors at a Threshold Distance
- Practice note date: 2026-05-24
- Domain: Coding / Graph
- Confidence: High
```

### 26.4 Why Evidence Matters

Evidence links help the system:

- Avoid hallucinated knowledge
- Explain why a readiness status changed
- Detect repeated mistakes
- Support cleanup decisions
- Let users review the original context

---

## 27. Company-Specific Preparation Mode

The product should support company-specific preparation because interview expectations differ across companies and roles.

### 27.1 Inputs

Users may add:

- Job descriptions
- Recruiter messages
- Company interview guides
- Interview experience notes
- Role requirements
- Interview feedback

### 27.2 Company Profile Schema

```text
Company:
Role:
Interview Stages:
Likely Coding Topics:
Likely System Design Topics:
Likely Behavioral Competencies:
Role-Specific Skills:
User Gaps:
Recommended Preparation:
Sources:
Last Updated:
```

### 27.3 Output

The system should generate a company-specific readiness view:

```text
For this role, your biggest gaps are:
1. Graph shortest path recognition
2. Capacity estimation for high-scale systems
3. Leadership story with measurable impact
```

### 27.4 Update Rule

Company-specific notes should not overwrite general readiness. They should create a filtered preparation view for a specific interview target.

---

## 28. Pre-Interview Brief

The product should generate a concise pre-interview brief before a scheduled or planned interview.

### 28.1 Purpose

The brief helps users quickly review the highest-impact information before an interview.

### 28.2 Brief Contents

```text
Target Company / Role
Interview Type
Top Coding Patterns to Review
System Design Reminders
Behavioral Stories to Use
Known Mistakes to Avoid
Company-Specific Notes
Last-Minute Practice Plan
```

### 28.3 Example

```text
Pre-Interview Brief

Coding:
- Review shortest path decision guide
- Practice one stack-with-state problem
- Watch for duplicate handling and stale heap entries

System Design:
- Clarify requirements before proposing architecture
- Do capacity estimation before database choice
- Mention bottlenecks and failure modes

Behavioral:
- Conflict: Team project delay recovery
- Leadership: Capstone project coordination
- Missing: strong failure story

Known Mistakes:
- Explaining solution too early
- Not quantifying impact
- Forgetting edge cases
```

---

## 29. System Design Evaluation Rubric

System design practice should be evaluated with a rubric, not just free-form notes.

### 29.1 Rubric Dimensions

```text
Clarification
Functional requirements
Non-functional requirements
Capacity estimation
API design
Data model
High-level architecture
Component deep dive
Trade-offs
Bottlenecks
Failure modes
Scalability
Reliability
Communication
```

### 29.2 Status Per Dimension

Each dimension can use the same readiness statuses:

```text
Missing
Weak
Needs Review
Okay
Strong
```

### 29.3 Example

```text
Case Study: URL Shortener

Strong:
- API design
- Data model

Weak:
- Capacity estimation
- Collision handling
- Failure modes

Review Action:
Redo URL Shortener with explicit QPS, storage estimate, and collision strategy.
```

### 29.4 Rubric Update Rule

System design notes should update the rubric when the same weakness appears multiple times or when mock interview feedback provides direct evidence.

---

## 30. Behavioral Story Coverage Map

Behavioral preparation should be organized around stories and competencies, not only individual questions.

### 30.1 Core Idea

One story can answer multiple questions, and one competency can be supported by multiple stories.

### 30.2 Competency Coverage Table

```text
Competency              Story Available?      Strength
Conflict                Yes                   Weak
Leadership              Yes                   Medium
Failure                 No                    Missing
Ambiguity               Yes                   Medium
Ownership               Yes                   Strong
Communication           Yes                   Weak
Learning from mistake   No                    Missing
```

### 30.3 Story Quality Criteria

A strong behavioral story should include:

- Clear situation
- Clear personal responsibility
- Specific action
- Measurable or concrete result
- Reflection or learning
- Authentic user voice
- 30-second, 60-second, and 2-minute versions

### 30.4 AI Rules for Behavioral Notes

The AI should:

- Preserve the user's voice
- Avoid inventing results
- Mark missing details clearly
- Suggest stronger phrasing separately
- Keep user-approved story versions

---

## 31. AI Safety and Trust Rules

The AI must behave conservatively when maintaining the knowledge base.

### 31.1 General Rules

The AI should:

- Suggest before overwriting
- Explain why an update is proposed
- Link updates to evidence
- Show confidence level
- Preserve original raw notes
- Allow users to reject or edit suggestions
- Keep change history

### 31.2 Do Not Invent

The AI must not invent:

- LeetCode performance history
- Interview feedback
- Behavioral story results
- Company-specific requirements
- User experience or achievements

If information is missing, the AI should mark it as missing instead of filling it in.

### 31.3 Confidence Labels

```text
High: clear evidence and strong match
Medium: likely match but may need user review
Low: vague input or uncertain classification
```

Low-confidence items should generally stay in raw notes unless the user approves an update.

---

## 32. Cleanup, Merge, and Archive Workflow

The product should include periodic cleanup to prevent the compiled knowledge base from becoming messy.

### 32.1 Cleanup Triggers

The system should suggest cleanup when:

- Multiple notes have overlapping titles
- A pattern note becomes too long
- Too many representative problems are listed
- A mistake appears in several places
- A review map contains low-level details
- An old note has not been used for a long time

### 32.2 Cleanup Actions

```text
Merge duplicate notes
Split overloaded notes
Archive low-value details
Move details from review map to algorithm note
Move personal mistake from pattern note to mistake log
Remove duplicate representative examples
```

### 32.3 Example

```text
Possible duplicate notes:
- Stack with Counter
- Stack with State
- Adjacent Duplicate Stack

Suggested action:
Use Stack with State as the canonical note.
Move counter-specific details into a variant section.
Archive Adjacent Duplicate Stack as a problem-specific note.
```

### 32.4 User Approval

Merge, split, archive, and delete-like actions are high-impact and require explicit user approval.

---

## 33. MVP Baseline Record

This section records the agreed MVP direction to avoid scope creep.

### 33.1 MVP Product Concept

**Interview Knowledge Compiler** is an AI interview preparation knowledge base that turns raw practice notes into structured compiled knowledge.

The MVP should focus on helping users answer:

> What did I learn, what mistake did I make, what existing knowledge should be updated, and what should I practice next?

### 33.2 MVP Primary User

Software engineering candidates preparing for coding, system design, and behavioral interviews.

The initial strongest use case is a user who writes messy practice reflections after LeetCode or mock interview sessions.

### 33.3 MVP Core Workflow

```text
User writes raw practice note
-> AI detects interview domain
-> AI extracts structured knowledge
-> AI finds related existing notes
-> AI generates update proposal
-> User approves / edits / rejects
-> System updates compiled knowledge
-> System updates mistake log and readiness map
-> System suggests next review task
```

### 33.4 MVP Must-Have Features

```text
1. Raw note capture
2. Domain detection
3. Structured extraction
4. AI update proposals
5. User approval flow
6. Coding problem note generation
7. Pattern / algorithm linking
8. Mistake log
9. Review task generation
10. Global readiness map
11. Knowledge update policy / no-update rules
12. Evidence linking
13. Simple readiness statuses
```

### 33.5 MVP Initial Domain Priority

```text
Phase 1: Coding / LeetCode Compiler
- Problem reflections
- Pattern detection
- Mistake extraction
- Review tasks
- Coding readiness map

Phase 2: System Design Compiler
- Case study notes
- Trade-off notes
- Rubric-based feedback
- System design readiness map

Phase 3: Behavioral Compiler
- Story bank
- STAR extraction
- Competency coverage map
- Behavioral readiness map
```

### 33.6 MVP Out of Scope

```text
Full autonomous background agent
Automatic LeetCode import
Video interview analysis
Full collaborative workspace
Calendar integration
Complex numeric scoring
Fully custom user-defined schemas
Company-wide team knowledge base
```

### 33.7 MVP Success Criteria

The MVP is successful if users can:

- Add messy raw notes without formatting them manually
- Receive useful structured update proposals
- Approve updates with minimal editing
- See recurring mistakes clearly
- Know what to review next
- Trust that compiled notes stay cleaner than ordinary notes

### 33.8 MVP Design Constraint

The MVP should prioritize knowledge cleanliness over automation.

The system should not try to update everything. It should help users keep a small, useful, evidence-backed interview knowledge base.

---

## 34. Technical Specification

This section records the agreed implementation direction for the MVP.

### 34.1 Technical Goals

The system should be:

- Simple enough to build and inspect quickly
- Self-hostable with a local-first development path
- Agent-ready without requiring a fully autonomous background system
- Built around Postgres as the durable source of truth
- Conservative about AI writes to user knowledge
- Easy to extend from Coding into System Design and Behavioral later

### 34.2 Recommended Stack

```text
Frontend:
- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui

Backend:
- Express
- TypeScript
- postgres Node.js client
- OpenAI Agents SDK

Database:
- Self-hosted PostgreSQL
- Plain SQL migrations
- Postgres full-text search
- pgvector later if semantic search becomes necessary

Deployment:
- Docker Compose for local development
- Separate web, API, worker, and Postgres services when needed
```

The product should not use an ORM for the MVP. Database access should use hand-written SQL through the `postgres` Node.js client, organized behind a small database helper rather than raw pool usage in repositories.

### 34.3 Application Structure

```text
/apps/web
  React user interface

/apps/api
  Express API
  Auth/session handling
  Note and proposal endpoints
  Agent runtime entrypoints

/packages/db
  SQL migrations
  Database pool
  Query modules

/packages/agents
  Agent definitions
  Agent tools
  Extraction schemas
  Prompt templates
  Proposal generation logic
```

The backend should own durable writes. Agents may call tools that search notes, draft proposals, and prepare structured changes, but approved compiled knowledge updates should go through explicit backend commands.

### 34.4 Core Runtime Flow

```text
User writes raw note in React
-> Express saves raw note to Postgres
-> Agent runtime extracts structured knowledge
-> System searches related notes using concept index and full-text search
-> Agent drafts update proposal
-> Proposal is saved to Postgres
-> React displays proposal to user
-> User approves, edits, or rejects
-> Express applies approved updates
-> System updates evidence links, mistake log, review tasks, and readiness map
```

### 34.5 Agent Runtime

The MVP should integrate a real agent runtime using the OpenAI Agents SDK rather than treating AI as only a one-shot completion API.

Agents should be used for:

- Domain classification
- Structured extraction
- Related-note reasoning
- Update proposal generation
- Review task generation
- Readiness map recommendations
- Cleanup suggestions

Agents should not directly mutate compiled knowledge without an approval step.

Recommended agent tools:

```text
get_raw_note(note_id)
search_related_notes(query, filters)
get_compiled_note(note_id)
lookup_concepts(concepts)
create_update_proposal(proposal)
save_proposal_item(item)
create_review_task(task)
append_evidence_link(link)
suggest_readiness_change(change)
```

High-impact tools such as merge, split, archive, or rewrite should require explicit user confirmation.

### 34.6 Postgres as Source of Truth

Postgres should store both user-facing knowledge and system/agent state.

Recommended core tables:

```text
users
sessions

raw_notes
compiled_notes
note_links
concepts
concept_index
evidence_links

update_proposals
proposal_items
approval_decisions

mistakes
review_tasks
readiness_items

agent_runs
agent_run_events
```

Compiled notes should store human-readable Markdown plus structured fields.

```text
compiled_notes
- id
- user_id
- domain
- note_type
- title
- body_markdown
- structured_data jsonb
- status
- last_reviewed_at
- created_at
- updated_at
```

Raw notes should preserve original user input.

```text
raw_notes
- id
- user_id
- domain
- source_type
- title
- body_markdown
- extracted_data jsonb
- created_at
```

### 34.7 LLM-Wiki Indexing Model

The product should use an LLM-wiki mindset.

```text
Raw notes = source documents
Compiled notes = wiki pages
Extracted concepts = index terms
Evidence links = citations
Readiness map = navigation layer
Review tasks = action layer
```

The LLM should maintain the index layer, not act as the database.

When a raw note is added, the system should:

1. Extract concepts, entities, patterns, algorithms, mistakes, competencies, and possible canonical pages.
2. Store those extracted concepts in `concept_index`.
3. Use the concept index to find related notes.
4. Use related notes as context for update proposal generation.
5. Link proposed updates back to raw evidence.

For Coding notes, the indexer should treat algorithm variants as first-class wiki index signals instead of flattening them into only the base algorithm. For example, a raw note about `Cheapest Flights Within K Stops` should still link to `Dijkstra`, but it should also extract concepts such as `Constrained Shortest Path`, `Shortest Path With State`, `K Stops / Edge Budget`, `Priority Queue`, and `dist[node][edges]`. The proposal should explain that the note is a variant of shortest path where the state includes the number of edges or stops used.

Example concept index record:

```text
concept_index
- id
- user_id
- concept_id
- target_type
- target_id
- relation_type
- confidence
- source
- created_at
```

### 34.8 Related Note Search

Related-note search should start with deterministic Postgres features before adding embeddings.

MVP search should combine:

- Exact concept matches
- Domain and note-type filters
- Postgres full-text search
- Existing note links
- Mistake categories
- Readiness items

Ranking should prefer:

- Exact algorithm or pattern matches
- Canonical compiled notes
- Notes with strong evidence links
- Recent repeated mistakes
- High full-text search rank

Ranking should deprioritize:

- Archived notes
- Low-confidence extracted concepts
- Duplicative notes
- Stale notes unless the staleness itself is relevant

Semantic embeddings and `pgvector` can be added later as a third layer for fuzzy related-note discovery.

```text
MVP:
full-text search + concept index + links

Later:
full-text search + concept index + links + pgvector
```

### 34.9 Agentic Raw Note Indexing Flow

The MVP raw-note compile path should run through a queued `compile_raw_note` agent run. The first implementation may use a deterministic local wiki indexer as the fallback, but the service boundary should allow an LLM provider when `OPENAI_API_KEY` is configured.

```text
POST /raw-notes
-> save raw note
-> enqueue compile_raw_note agent run
-> load raw note
-> LLM-wiki indexer extracts canonical concepts and variant signals
-> write extracted_data and concept_index entries
-> search related compiled notes
-> draft update proposal
-> save proposal
-> record agent_run_events for each step
-> UI shows indexing trace on the raw-note page
```

Required trace events:

- `raw_note_loaded`
- `detection_completed`
- `wiki_index_drafted`
- `related_knowledge_found`
- `proposal_created`
- `run_completed`

All durable compiled knowledge writes remain approval-gated. The agent run may save extraction metadata, concept index entries, and pending proposals, but approved compiled notes, mistake records, review tasks, and readiness changes should still be applied through the proposal approval flow.

### 34.10 Auth and Secrets

The app should use its own authentication and session model. It should not depend on Codex CLI authentication or read local Codex auth files.

Recommended auth options:

```text
Option A: Better Auth with Postgres
Option B: Auth.js with Postgres
Option C: Minimal custom email/password or magic-link auth for local MVP
```

OpenAI access should be handled server-side using environment variables.

```text
OPENAI_API_KEY
OPENAI_WIKI_INDEX_MODEL
DATABASE_URL
SESSION_SECRET
```

User browsers should never receive provider API keys.

### 34.11 API Surface

Recommended MVP endpoints:

```text
POST /raw-notes
GET /raw-notes
GET /raw-notes/:id
PATCH /raw-notes/:id
DELETE /raw-notes/:id
POST /raw-notes/:id/compile
GET /raw-notes/:id/indexing-trace

GET /compiled-notes
GET /compiled-notes/:id

POST /agent-runs/note-ingestion
POST /agent-runs
GET /agent-runs
GET /agent-runs/:id

GET /update-proposals
GET /update-proposals/:id
POST /update-proposals/:id/approve
POST /update-proposals/:id/reject

GET /review-tasks
POST /review-tasks/:id/complete

GET /readiness-map
GET /search
```

The API should expose proposal status and agent run events so the UI can show progress and explain what the AI did.

### 34.12 MVP Implementation Priority

```text
1. Database schema and migrations
2. Raw note capture API
3. Basic React note input
4. Agent extraction for Coding notes
5. Concept index and related-note search
6. Update proposal generation
7. User approval / rejection flow
8. Apply approved updates
9. Mistake log, review tasks, readiness map
10. Agent run event log
```

The first implementation should optimize for correctness, traceability, and clean data boundaries over automation.
