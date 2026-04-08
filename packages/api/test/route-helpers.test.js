import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { stripLeadingDirectCatMention } = await import(
  '../dist/domains/cats/services/agents/routing/route-helpers.js'
);

describe('route-helpers', () => {
  it('strips the current cat direct mention from the start of a user task', () => {
    assert.equal(stripLeadingDirectCatMention('@office 帮我做一页 PPT', 'jiuwenclaw'), '帮我做一页 PPT');
    assert.equal(stripLeadingDirectCatMention('@office，帮我做一页 PPT', 'jiuwenclaw'), '帮我做一页 PPT');
  });

  it('does not strip mentions that are not direct leading addresses', () => {
    assert.equal(
      stripLeadingDirectCatMention('请 @office 帮我做一页 PPT', 'jiuwenclaw'),
      '请 @office 帮我做一页 PPT',
    );
  });
});
