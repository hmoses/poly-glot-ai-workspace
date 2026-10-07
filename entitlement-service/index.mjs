import { handleEntitlementRequestWeb } from "./server.js";

export default {
  fetch(request) {
    return handleEntitlementRequestWeb(request);
  },
};
