import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const board = await readFile(new URL('../src/admin/OrderFlowBoard.tsx', import.meta.url), 'utf8')
const contracts = await readFile(new URL('../src/admin/contracts.ts', import.meta.url), 'utf8')
const flow = await readFile(new URL('../src/admin/orderFlow.ts', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')

test('Interest invitation confirmation shows the exact under-threshold warning', () => {
  assert.match(board, /Threshold not reached: \{qualifiedUnits\}\/\{productionThreshold\} interests\. Send invite anyway\?/)
  assert.match(board, /Threshold not configured\. Send invite remains available\./)
  assert.match(board, /Threshold reached: \{qualifiedUnits\}\/\{productionThreshold\} interests\./)
})

test('threshold management is available in the drop overview without crowding cards', () => {
  assert.match(board, /configured \? 'Edit threshold' : 'Set threshold'/)
  assert.match(board, /action: 'drop\.threshold\.preview'/)
  assert.match(board, /className="drop-threshold-button"/)
  assert.doesNotMatch(board, /Open invitations/)
})

test('Ready to invite is absent from the active UI contract', () => {
  assert.doesNotMatch(contracts, /'ready_to_invite'/)
  assert.doesNotMatch(board, /Ready to invite/)
})

test('five-column layout redistributes width and preserves one-line Awaiting payment with horizontal scroll', () => {
  assert.match(styles, /\.order-flow-scroll \{[^}]*overflow-x: auto/)
  assert.match(styles, /\.order-flow-board \{[^}]*grid-template-columns: repeat\(5,/)
  assert.match(styles, /\.order-flow-column h2 \{[^}]*white-space: nowrap/)
  assert.match(flow, /label: 'Awaiting payment'/)
})

test('delivery outcome is surfaced safely and always refreshes the derived board state', () => {
  assert.match(board, /result\.deliveryStatus === 'failed'/)
  assert.match(board, /actionResultMessage\(result\)/)
  assert.match(board, /setPending\(null\)[\s\S]*refresh\(\)/)
})
