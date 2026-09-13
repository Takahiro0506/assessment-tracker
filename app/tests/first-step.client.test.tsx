import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { QuickAdd } from '../components/quick-add';
import { emptyWorkspace, type Workspace } from '../lib/workspace';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3001',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { render, fireEvent, cleanup } = await import('@testing-library/react');
void test('one submission adds a title-only card and clears text only on acceptance', () => {
  let result: Workspace | undefined;
  const h = render(
    <QuickAdd
      data={emptyWorkspace()}
      disabled={false}
      first
      onAdd={(data) => {
        result = data;
        return true;
      }}
    />,
  );
  const input = h.getByLabelText('Assessment name') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'SQL exercises' } });
  fireEvent.submit(input.closest('form')!);
  assert.equal(result?.items[0].name, 'SQL exercises');
  assert.equal(input.value, '');
  cleanup();
});
void test('rejected saves keep the entered title for retry', () => {
  let attempts = 0;
  const h = render(
    <QuickAdd
      data={emptyWorkspace()}
      disabled={false}
      first
      onAdd={() => {
        attempts++;
        return false;
      }}
    />,
  );
  const input = h.getByLabelText('Assessment name') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'Keep my text' } });
  fireEvent.submit(input.closest('form')!);
  assert.equal(attempts, 1);
  assert.equal(input.value, 'Keep my text');
  cleanup();
});
void test('Enter while another save is pending cannot enqueue a competing save', () => {
  let calls = 0;
  const h = render(
    <QuickAdd
      data={emptyWorkspace()}
      disabled
      first
      onAdd={() => {
        calls++;
        return true;
      }}
    />,
  );
  const input = h.getByLabelText('Assessment name');
  fireEvent.change(input, { target: { value: 'Wait for the previous save' } });
  fireEvent.submit(input.closest('form')!);
  assert.equal(calls, 0);
  cleanup();
});
