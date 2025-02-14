export const apis = {
  "my-mod/mod": {
    requiresBaseResponse: false,
    getFinalResponse: async ({
      interceptionId,
      request,
      responseHeaders,
      response,
      resourceType,
    }: any) => {
      let bodyData = "Hello World!";
      let contentType = "text/plain";
      return { body: bodyData, contentType };
    },
  },
};
