;; VotingMechanism.clar
;; Core voting contract for RapidRaise platform
;; Handles crowd-voting with weighted governance tokens, quadratic voting option,
;; vote delegation, and automatic tallying for fund distribution proposals.

;; Constants
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-VOTING-NOT-ACTIVE u101)
(define-constant ERR-VOTING-ENDED u102)
(define-constant ERR-INVALID-PROPOSAL u103)
(define-constant ERR-INSUFFICIENT-TOKENS u104)
(define-constant ERR-ALREADY-VOTED u105)
(define-constant ERR-INVALID-WEIGHT u106)
(define-constant ERR-DELEGATION-EXISTS u107)
(define-constant ERR-NOT-DELEGATED u108)
(define-constant ERR-PROPOSAL-EXPIRED u109)
(define-constant ERR-INVALID-CAMPAIGN u110)
(define-constant ERR-QUADRATIC-VOTING-NOT-ENABLED u111)
(define-constant ERR-VOTE-EXCEEDS-ALLOWANCE u112)
(define-constant ERR-TALLY-NOT-READY u113)
(define-constant ERR-PROPOSAL-NOT-FOUND u114)
(define-constant ERR-DELEGATE-SELF u115)
(define-constant ERR-VOTING-PAUSED u116)
(define-constant MAX-PROPOSAL-LENGTH u500) ;; Max length for proposal description
(define-constant MAX-VOTING-PERIOD u1440) ;; ~10 days in blocks (assuming 10-min blocks)
(define-constant MIN-VOTING-PERIOD u144) ;; ~1 day

;; Data Variables
(define-data-var voting-active bool false)
(define-data-var voting-paused bool false)
(define-data-var quadratic-voting-enabled bool true)
(define-data-var current-campaign-id uint u0)
(define-data-var voting-start-block uint u0)
(define-data-var voting-end-block uint u0)

;; Maps
(define-map campaigns
  { campaign-id: uint }
  { 
    organizer: principal,
    total-governance-tokens: uint,
    proposal-count: uint,
    voting-period: uint,
    active: bool
  })

(define-map proposals
  { campaign-id: uint, proposal-id: uint }
  { 
    submitter: principal,
    description: (string-utf8 500),
    allocation-percentage: uint, ;; 0-100
    recipient: principal,
    total-votes: uint,
    quadratic-total: uint,
    submission-block: uint,
    expired: bool
  })

(define-map votes
  { campaign-id: uint, proposal-id: uint, voter: principal }
  { 
    weight: uint,
    quadratic-weight: uint,
    delegated: bool
  })

(define-map delegations
  { campaign-id: uint, delegator: principal }
  { delegatee: principal })

(define-map voter-allowances
  { campaign-id: uint, voter: principal }
  { remaining-tokens: uint })

;; Private Functions
(define-private (is-organizer (campaign-id uint) (caller principal))
  (is-eq caller (default-to tx-sender (get organizer (map-get? campaigns { campaign-id: campaign-id })))))

(define-private (get-governance-balance (voter principal) (campaign-id uint))
  ;; Mock contract-call to GovernanceToken; in real: (contract-call? .GovernanceToken get-balance-for-campaign voter campaign-id)
  (ok u1000) ;; Placeholder for testing; replace with actual call
)

(define-private (calculate-quadratic-weight (weight uint))
  (pow weight u2)) ;; Simple quadratic: weight squared, but in practice use sqrt for cost, here for tally

(define-private (transfer-governance-tokens (from principal) (to principal) (amount uint) (campaign-id uint))
  ;; Mock transfer; in real: (contract-call? .GovernanceToken transfer-for-voting from to amount campaign-id)
  (ok true)
)

;; Public Functions

(define-public (initialize-campaign (campaign-id uint) (voting-period uint) (organizer principal))
  (begin
    (asserts! (is-eq tx-sender organizer) (err ERR-NOT-AUTHORIZED))
    (asserts! (and (>= voting-period MIN-VOTING-PERIOD) (<= voting-period MAX-VOTING-PERIOD)) (err ERR-INVALID-WEIGHT))
    (asserts! (> campaign-id u0) (err ERR-INVALID-CAMPAIGN))
    (asserts! (is-none (map-get? campaigns { campaign-id: campaign-id })) (err ERR-ALREADY-VOTED))
    (map-set campaigns { campaign-id: campaign-id }
      { organizer: organizer, total-governance-tokens: u0, proposal-count: u0, voting-period: voting-period, active: true })
    (var-set current-campaign-id campaign-id)
    (ok true)))

(define-public (start-voting (campaign-id uint))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-INVALID-CAMPAIGN))))
    (asserts! (is-organizer campaign-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (var-get voting-active)) (err ERR-VOTING-NOT-ACTIVE))
    (asserts! (get active campaign) (err ERR-VOTING-ENDED))
    (var-set voting-active true)
    (var-set voting-start-block block-height)
    (var-set voting-end-block (+ block-height (get voting-period campaign)))
    (ok true)))

(define-public (pause-voting (campaign-id uint))
  (begin
    (asserts! (is-organizer campaign-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (var-get voting-active) (err ERR-VOTING-NOT-ACTIVE))
    (var-set voting-paused true)
    (ok true)))

(define-public (unpause-voting (campaign-id uint))
  (begin
    (asserts! (is-organizer campaign-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (var-get voting-active) (err ERR-VOTING-NOT-ACTIVE))
    (var-set voting-paused false)
    (ok true)))

(define-public (end-voting (campaign-id uint))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-INVALID-CAMPAIGN))))
    (try! (validate-campaign-id campaign-id))
    (asserts! (or (is-organizer campaign-id tx-sender) (> block-height (var-get voting-end-block))) (err ERR-NOT-AUTHORIZED))
    (asserts! (var-get voting-active) (err ERR-VOTING-NOT-ACTIVE))
    (var-set voting-active false)
    (map-set campaigns { campaign-id: campaign-id } (merge campaign { active: false }))
    ;; Trigger DistributionExecutor here in real impl
    (ok true)))

(define-public (submit-proposal (campaign-id uint) (description (string-utf8 500)) (allocation-percentage uint) (recipient principal))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-INVALID-CAMPAIGN)))
        (proposal-id (+ (get proposal-count campaign) u1)))
    (asserts! (> campaign-id u0) (err ERR-INVALID-CAMPAIGN))
    (asserts! (is-some (get-campaign-details campaign-id)) (err ERR-INVALID-CAMPAIGN))
    (asserts! (not (is-eq recipient tx-sender)) (err ERR-NOT-AUTHORIZED))
    (asserts! (var-get voting-active) (err ERR-VOTING-NOT-ACTIVE))
    (asserts! (not (var-get voting-paused)) (err ERR-VOTING-PAUSED))
    (asserts! (<= (len description) MAX-PROPOSAL-LENGTH) (err ERR-INVALID-PROPOSAL))
    (asserts! (and (> allocation-percentage u0) (<= allocation-percentage u100)) (err ERR-INVALID-WEIGHT))
    (map-set proposals { campaign-id: campaign-id, proposal-id: proposal-id }
      { submitter: tx-sender, description: description, allocation-percentage: allocation-percentage, recipient: recipient,
        total-votes: u0, quadratic-total: u0, submission-block: block-height, expired: false })
    (map-set campaigns { campaign-id: campaign-id } (merge campaign { proposal-count: proposal-id }))
    (ok proposal-id)))

(define-public (vote (campaign-id uint) (proposal-id uint) (weight uint))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-INVALID-CAMPAIGN)))
        (proposal (unwrap! (map-get? proposals { campaign-id: campaign-id, proposal-id: proposal-id }) (err ERR-INVALID-PROPOSAL)))
        (voter tx-sender))
    (try! (validate-campaign-id campaign-id))
    (asserts! (and (> proposal-id u0) (<= proposal-id (get proposal-count campaign))) (err ERR-INVALID-PROPOSAL))
    (let ((balance (unwrap! (get-governance-balance voter campaign-id) (err ERR-INSUFFICIENT-TOKENS)))
          (allowance (default-to balance (get remaining-tokens (map-get? voter-allowances { campaign-id: campaign-id, voter: voter }))))
          (q-weight (if (var-get quadratic-voting-enabled) (calculate-quadratic-weight weight) weight)))
      (asserts! (var-get voting-active) (err ERR-VOTING-NOT-ACTIVE))
      (asserts! (not (var-get voting-paused)) (err ERR-VOTING-PAUSED))
      (asserts! (< block-height (var-get voting-end-block)) (err ERR-VOTING-ENDED))
      (asserts! (not (get expired proposal)) (err ERR-PROPOSAL-EXPIRED))
      (asserts! (is-none (map-get? votes { campaign-id: campaign-id, proposal-id: proposal-id, voter: voter })) (err ERR-ALREADY-VOTED))
      (asserts! (> weight u0) (err ERR-INVALID-WEIGHT))
      (asserts! (<= weight allowance) (err ERR-VOTE-EXCEEDS-ALLOWANCE))
      (if (var-get quadratic-voting-enabled)
        (asserts! true (err ERR-QUADRATIC-VOTING-NOT-ENABLED))
        true)
      (map-set votes { campaign-id: campaign-id, proposal-id: proposal-id, voter: voter } { weight: weight, quadratic-weight: q-weight, delegated: false })
      (map-set proposals { campaign-id: campaign-id, proposal-id: proposal-id }
        (merge proposal { total-votes: (+ (get total-votes proposal) weight), quadratic-total: (+ (get quadratic-total proposal) q-weight) }))
      (map-set voter-allowances { campaign-id: campaign-id, voter: voter } { remaining-tokens: (- allowance weight) })
      (ok true))))

(define-public (delegate-vote (campaign-id uint) (delegatee principal))
  (let ((delegator tx-sender)
        (balance (unwrap! (get-governance-balance delegator campaign-id) (err ERR-INSUFFICIENT-TOKENS))))
    (asserts! (var-get voting-active) (err ERR-VOTING-NOT-ACTIVE))
    (asserts! (not (var-get voting-paused)) (err ERR-VOTING-PAUSED))
    (asserts! (not (is-eq delegator delegatee)) (err ERR-DELEGATE-SELF))
    (asserts! (is-none (map-get? delegations { campaign-id: campaign-id, delegator: delegator })) (err ERR_DELEGATION-EXISTS))
    (asserts! (> balance u0) (err ERR-INSUFFICIENT-TOKENS))
    (map-set delegations { campaign-id: campaign-id, delegator: delegator } { delegatee: delegatee })
    ;; Transfer tokens to delegatee for voting
    (try! (transfer-governance-tokens delegator delegatee balance campaign-id))
    (ok true)))

(define-public (revoke-delegation (campaign-id uint))
  (let ((delegator tx-sender)
        (delegation (unwrap! (map-get? delegations { campaign-id: campaign-id, delegator: delegator }) (err ERR-NOT-DELEGATED))))
    (asserts! (var-get voting-active) (err ERR-VOTING-NOT-ACTIVE))
    (map-delete delegations { campaign-id: campaign-id, delegator: delegator })
    ;; Transfer back tokens
    (try! (transfer-governance-tokens (get delegatee delegation) delegator (unwrap! (get-governance-balance delegator campaign-id) (err ERR-INSUFFICIENT-TOKENS)) campaign-id))
    (ok true)))

(define-public (expire-proposal (campaign-id uint) (proposal-id uint))
  (let ((proposal (unwrap! (map-get? proposals { campaign-id: campaign-id, proposal-id: proposal-id }) (err ERR-PROPOSAL-NOT-FOUND)))
        (campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-INVALID-CAMPAIGN))))
    (asserts! (is-organizer campaign-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get expired proposal)) (err ERR_PROPOSAL-EXPIRED))
    (map-set proposals { campaign-id: campaign-id, proposal-id: proposal-id } (merge proposal { expired: true }))
    (ok true)))

;; Read-Only Functions

(define-read-only (get-campaign-details (campaign-id uint))
  (map-get? campaigns { campaign-id: campaign-id }))

(define-read-only (get-proposal-details (campaign-id uint) (proposal-id uint))
  (map-get? proposals { campaign-id: campaign-id, proposal-id: proposal-id }))

(define-read-only (get-vote-details (campaign-id uint) (proposal-id uint) (voter principal))
  (map-get? votes { campaign-id: campaign-id, proposal-id: proposal-id, voter: voter }))

(define-read-only (get-delegation (campaign-id uint) (delegator principal))
  (map-get? delegations { campaign-id: campaign-id, delegator: delegator }))

(define-read-only (get-voter-allowance (campaign-id uint) (voter principal))
  (default-to u0 (get remaining-tokens (map-get? voter-allowances { campaign-id: campaign-id, voter: voter }))))

(define-read-only (is-voting-active)
  (var-get voting-active))

(define-read-only (get-voting-end-block)
  (var-get voting-end-block))

(define-read-only (get-winning-proposal (campaign-id uint))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-INVALID-CAMPAIGN))))
    (if (not (var-get voting-active))
      (fold find-max-proposal (range u1 (get proposal-count campaign)) { max-votes: u0, winning-id: u0, campaign-id: campaign-id })
      (err ERR_TALLY-NOT-READY))))

(define-private (find-max-proposal (prop-id uint) (acc {max-votes: uint, winning-id: uint, campaign-id: uint}))
  (let ((proposal (default-to { total-votes: u0, quadratic-total: u0 } (map-get? proposals { campaign-id: (get campaign-id acc), proposal-id: prop-id })))
        (votes (if (var-get quadratic-voting-enabled) (get quadratic-total proposal) (get total-votes proposal))))
    (if (> votes (get max-votes acc))
      { max-votes: votes, winning-id: prop-id, campaign-id: (get campaign-id acc) }
      acc)))

(define-private (range (start uint) (end uint))
  (unwrap-panic (slice? (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10) u0 (- end start)))) ;; Simplified; extend for more proposals