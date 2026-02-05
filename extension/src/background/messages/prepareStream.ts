import type { PlasmoMessaging } from '@plasmohq/messaging';

import type { BaseRequest } from '~types/request';
import type { BaseResponse } from '~types/response';
import { setDynamicRules } from '~utils/declarativeNetRequest';
import { assertDomainWhitelist, modifiableResponseHeaders } from '~utils/storage';

interface Request extends BaseRequest {
  ruleId: number;
  targetDomains?: [string, ...string[]];
  targetRegex?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

const handler: PlasmoMessaging.MessageHandler<Request, BaseResponse> = async (req, res) => {
  try {
    if (!req.sender?.tab?.url) throw new Error('No tab URL found in the request.');
    if (!req.body) throw new Error('No request body found in the request.');

    // restrict what response headers can be modified
    const responseHeaders = req.body.responseHeaders ?? {};
    const filteredResponseHeaders: Record<string, string> = {};
    Object.entries(responseHeaders).forEach(([key, value]) => {
      if (modifiableResponseHeaders.has(key.toLowerCase())) {
        filteredResponseHeaders[key] = value;
      }
    });
    req.body.responseHeaders = filteredResponseHeaders;

    await assertDomainWhitelist(req.sender.tab.url);
    await setDynamicRules(req.body);
    res.send({
      success: true,
    });
  } catch (err) {
    res.send({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export default handler;
