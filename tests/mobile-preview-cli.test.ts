import {describe,it,expect} from 'vitest';
import {parseEventPreviewOptions} from '../src/mcp/mobile-review-cli.mjs';

describe('Standalone Markcut CLI preview (notification belongs to Neo)',()=>{
 it('accepts externally supplied event templates without a phone or APNs URL',()=>{
  expect(parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','template.json']).delivery).toBe('event');
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event'])).toThrow();
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','a','--phone-url','http://phone'])).toThrow();
  expect(parseEventPreviewOptions(['preview','video.md','--delivery','text']).delivery).toBe('text');
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','text','--event-template','a'])).toThrow();
 });
});
