# HockeySense project memory

These principles summarize the user's feedback through September 24, 2026. Apply them to product design, model instructions, report processing, saved feedback, and future changes. They are durable preferences, not claims that the current implementation satisfies every principle. New explicit user instructions take precedence.

## Evidence before advice

- Default to omission whenever any material ambiguity could change whether the play was a mistake. This applies to every coaching category and every source of uncertainty, including poor footage, missing context, identity, possession, timing, and plausible alternative explanations. Do not merely hedge the criticism or lower its confidence. Require clear evidence and a realistically actionable correction; zero findings is acceptable.

- Analyze only the selected player. Other players provide context. Preserve identity across the clip; withhold feedback when identity is uncertain.
- A coaching issue needs a visible mistake or missed opportunity, a concrete game situation that makes it matter, and a specific useful correction. Generic best practices do not become clip-specific findings merely because they are good advice.
- Absence of visible evidence is not evidence of absence. Sparse frames, blur, or a distant camera cannot establish that the player failed to glance, scan, communicate, or notice something. Do not infer attention or intent from those gaps.
- Do not invent hypothetical threats to justify feedback. A bad outcome is not required: a clearly visible open opponent, missed passing option, or avoidable loss of space can matter even if no goal or turnover follows. State the observable missed opportunity rather than a speculative cause.
- Fewer trustworthy findings are better than a quota of weak suggestions. Zero issues is a valid result. Confidence labels do not rescue unsupported claims.
- Separate positive reinforcement from corrections. Praise belongs in an explicitly labeled, optional “Keep doing this” area. Do not attach a generic improvement to a good play just to manufacture a teaching moment.
- Skating critiques require enough visual and temporal evidence to assess the claimed movement. Motion blur alone does not prove acceleration, and wide or sparse footage does not establish precise mechanics.
- Role-model goals can inspire practice, but do not establish a deficiency in the user's play. Distinguish general style advice from observed evidence.

## Identity and possession are separate prerequisites

- Leading the rush, entering a zone, or team possession does not prove the selected player carries the puck. Establish the selected player's identity and actual puck control independently before evaluating a passing, shooting, or puck-retention decision.
- If the puck is not resolvable, withhold possession-dependent advice. Do not substitute the actual puck carrier for the selected player.
- Model-written evidence and confidence are not independent verification. Repeated basic factual errors warrant flagging the remaining review as unreliable, rather than deleting individual sentences and implying everything else is trustworthy.

## Realistic actionability, not hindsight

- Only recommend decisions or technique changes the player could realistically execute with the information, response time, momentum, orientation, pressure, and support available at that moment.
- An unpredictable clearance or deflection requires normal reaction time. Do not label the unavoidable response interval a delay or expect foreknowledge of the puck's path.
- Establish team-relative position and responsibility before saying the player trails a breakout. Being behind the puck is not the same as being behind teammates.
- Roughly one-second samples cannot resolve sub-second reaction timing. If the cue and feasible response window cannot be established, omit the learning point.
- A suggested alternative must be feasible, not merely ideal. Apply this standard equally to tactical choices and skating technique.

## Make the review useful at a glance

- Lead with roughly five important, distinct improvement areas, or fewer when evidence supports fewer. Rank by meaningful impact and evidence, not just category frequency. Avoid generic category headings that imply an unobserved flaw.
- Keep the default summary short. Put a few specific subissues and timestamp links behind expandable controls; do not concatenate section narratives into a wall of text.
- After Analyze, focus the page on the video, priorities, and coaching moments. Hide completed identification/setup steps behind an explicit edit action. Preserve an easy path back without losing playback context.
- Show the next useful action clearly. Disabled or muted controls need an understandable reason and a route to resolve the blocker.
- Support natural workflows such as dragging in a video and selecting oneself visually, with jersey details as an alternative or aid.

## Finish the job without babysitting

- One Analyze action should review the entire selected interval, then present a complete report. Internal sections must not require repeated user confirmations or investigations.
- The user is comfortable stepping away during analysis. Show real progress, preserve completed work, recover automatically from temporary failures, and allow returning later.
- Teaching pauses during replay are optional. Do not confuse interactive playback with a need for user participation in the analysis job.
- Diagnose latency with timings before attributing it to local APIs, timeouts, or the model. Avoid redundant decoding, repeated downloads, overlapping polling, unnecessary model calls, and lost checkpoints.
- Errors should explain the actionable cause and link directly to the relevant remedy, such as billing or limits. Distinguish temporary failures from account problems.

## Learn from corrections across the product

- Treat user corrections as evidence about a failure mode, not merely a request to delete one sentence. Review related findings, summary priorities, drills, history, and cached reports for the same unsupported inference.
- Removing a finding should also remove or reconsider recommendations derived solely from it. Repetition of an unsupported claim across clips does not make it a recurring weakness.
- Preserve the distinction between a user correction, model inference, and verified observation. Do not claim an entire old report is validated because a few examples were fixed.
- Prefer improving evidence requirements and selection logic over brittle phrase blacklists. Wording alone does not determine whether a finding is supported.
- Keep useful existing work and user data. Obsolete implementation can be removed when it no longer serves the product; do not treat that authorization as permission to discard clips or history.

## Calibration examples

- “Despite motion blur, the player is visibly accelerating …” is neither an established flaw nor sufficient evidence of acceleration. Omit it as a correction; use praise only if independently supported.
- “Glance to check for late weak-side threats” is not warranted when the footage does not establish a missed check or an actual relevant threat. The user reported making that check. Do not turn an uncaptured action into an accusation.
- “The passing lane to the visibly open teammate closed while the player held the puck” could support a decision-making correction if the footage actually establishes those events. It does not by itself prove the player failed to look.

