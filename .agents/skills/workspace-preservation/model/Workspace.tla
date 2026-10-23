------------------------- MODULE Workspace -------------------------
EXTENDS Integers
CONSTANTS CheckLease, CheckAcknowledgement, CheckResponse
VARIABLES committed, pendingSave, session, primary, draft, cloud, dirty,
          owner, generation, request, requestEpoch, pending, opening,
          warned, lost, staleMountWrite, wrongAcknowledgement, staleResponse
vars == <<committed, pendingSave, session, primary, draft, cloud, dirty,
          owner, generation, request, requestEpoch, pending, opening,
          warned, lost, staleMountWrite, wrongAcknowledgement, staleResponse>>
Init == /\ committed = 0 /\ pendingSave = 0 /\ session = 0
        /\ primary = [o \in {"a", "b"} |-> 0]
        /\ cloud = [o \in {"a", "b"} |-> 0]
        /\ draft = [o \in {"a", "b"} |-> -1]
        /\ dirty = [o \in {"a", "b"} |-> FALSE]
        /\ owner = "a" /\ generation = 0 /\ request = -1
        /\ requestEpoch = 0 /\ pending = -1 /\ opening = ""
        /\ warned = FALSE /\ lost = FALSE /\ staleMountWrite = FALSE
        /\ wrongAcknowledgement = FALSE /\ staleResponse = FALSE
Commit == /\ owner = "a" /\ generation = 0 /\ committed < 2
          /\ committed' = committed + 1 /\ pendingSave' = committed + 1
          /\ session' = committed + 1
          /\ UNCHANGED <<primary, draft, cloud, dirty, owner, generation,
               request, requestEpoch, pending, opening, warned, lost,
               staleMountWrite, wrongAcknowledgement, staleResponse>>
Flush == /\ owner # "" /\ pendingSave >= 0
         /\ (~CheckLease \/ generation = 0)
         /\ (pendingSave # primary[owner] \/ dirty[owner])
         /\ primary' = [primary EXCEPT ![owner] = pendingSave]
         /\ draft' = [draft EXCEPT ![owner] = pendingSave]
         /\ dirty' = [dirty EXCEPT ![owner] = TRUE]
         /\ request' = IF request = -1 THEN pendingSave ELSE request
         /\ requestEpoch' = IF request = -1 THEN generation ELSE requestEpoch
         /\ pending' = IF request = -1 THEN -1 ELSE pendingSave
         /\ staleMountWrite' = (staleMountWrite \/ generation # 0)
         /\ UNCHANGED <<committed, pendingSave, session, cloud, owner, generation,
               opening, warned, lost, wrongAcknowledgement, staleResponse>>
Volatile == session >= 0 /\ session # primary["a"]
            /\ session # cloud["a"] /\ session # draft["a"]
SignOut == /\ owner = "a" /\ generation = 0 /\ ~warned
           /\ warned' = Volatile
           /\ owner' = IF Volatile THEN owner ELSE ""
           /\ generation' = IF Volatile THEN generation ELSE 1
           /\ session' = IF Volatile THEN session ELSE -1
           /\ pending' = IF Volatile THEN pending ELSE -1
           /\ lost' = (lost \/ (~Volatile /\ committed # primary["a"]
                      /\ committed # cloud["a"] /\ committed # draft["a"]))
           /\ UNCHANGED <<committed, pendingSave, primary, draft, cloud, dirty,
               request, requestEpoch, opening, staleMountWrite,
               wrongAcknowledgement, staleResponse>>
BeginRenew(target) == /\ generation = 0 /\ owner = "a"
                      /\ (target = "b" \/ (draft["a"] = -1 /\ ~dirty["a"]))
                      /\ generation' = 1 /\ opening' = target /\ pending' = -1
                      /\ UNCHANGED <<committed, pendingSave, session,
                           primary, draft, cloud, dirty, owner, request, requestEpoch,
                           warned, lost, staleMountWrite,
                           wrongAcknowledgement, staleResponse>>
Assign == /\ opening \in {"a", "b"} /\ owner' = opening
          /\ opening' = "hydrate"
          /\ session' = IF opening = owner THEN session ELSE -1
          /\ UNCHANGED <<committed, pendingSave, primary, draft, cloud, dirty,
               generation, request, requestEpoch, pending, warned, lost,
               staleMountWrite, wrongAcknowledgement, staleResponse>>
Hydrate == /\ opening = "hydrate" /\ session' = cloud[owner] /\ opening' = ""
           /\ primary' = [primary EXCEPT ![owner] = cloud[owner]]
           /\ dirty' = [dirty EXCEPT ![owner] = FALSE]
           /\ UNCHANGED <<committed, pendingSave, draft, cloud,
                owner, generation, request, requestEpoch, pending, warned,
                lost, staleMountWrite, wrongAcknowledgement, staleResponse>>
Ack == /\ request >= 0
       /\ LET current == generation = requestEpoch
              accepted == current \/ ~CheckResponse
              remove == accepted /\ (~CheckAcknowledgement \/ draft["a"] = request)
          IN /\ cloud' = IF accepted THEN [cloud EXCEPT !["a"] = request] ELSE cloud
             /\ draft' = IF remove THEN [draft EXCEPT !["a"] = -1] ELSE draft
             /\ dirty' = IF current /\ primary["a"] = request /\ pending = -1
                          THEN [dirty EXCEPT !["a"] = FALSE] ELSE dirty
             /\ wrongAcknowledgement' = (wrongAcknowledgement
                  \/ (remove /\ draft["a"] >= 0 /\ draft["a"] # request))
             /\ staleResponse' = (staleResponse \/ (accepted /\ ~current))
             /\ request' = IF current THEN pending ELSE -1
       /\ pending' = -1
       /\ UNCHANGED <<committed, pendingSave, session, primary, owner,
            generation, requestEpoch, opening, warned, lost, staleMountWrite>>
Next == Commit \/ Flush \/ SignOut \/ BeginRenew("a") \/ BeginRenew("b")
        \/ Assign \/ Hydrate \/ Ack
Spec == Init /\ [][Next]_vars
CommittedPreserved == ~lost
StaleMountInert == ~staleMountWrite
AcknowledgementMatches == ~wrongAcknowledgement
StaleResponseInert == ~staleResponse
====================================================================
