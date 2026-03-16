import {
  exchangeAuthorizationCode,
  getAuthorizationUrl,
  refreshStoredAccessToken,
} from "./notion-oauth";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--url")) {
    const authorizationUrl = getAuthorizationUrl();

    console.log("Open this Notion authorization URL in your browser:");
    console.log(authorizationUrl);
    console.log("");
    console.log("After approving the app, copy either:");
    console.log("- the full callback URL from the browser address bar, or");
    console.log("- just the `code` value from that URL");
    console.log("");
    console.log("Then run:");
    console.log("npm run oauth:exchange -- --code=<code-or-full-callback-url>");
    return;
  }

  if (args.includes("--exchange")) {
    const codeInput = getOptionValue(args, "--code");

    if (!codeInput) {
      throw new Error(
        "Missing authorization code. Run `npm run oauth:exchange -- --code=<code-or-full-callback-url>`.",
      );
    }

    const response = await exchangeAuthorizationCode(codeInput);

    console.log("OAuth exchange succeeded.");
    console.log(`Workspace: ${response.workspace_name ?? response.workspace_id}`);
    console.log("Saved NOTION_ACCESS_TOKEN and NOTION_REFRESH_TOKEN into .env.");
    console.log("You can now run `npm run scan`.");
    return;
  }

  if (args.includes("--refresh")) {
    const response = await refreshStoredAccessToken();

    console.log("OAuth token refresh succeeded.");
    console.log(`Workspace: ${response.workspace_name ?? response.workspace_id}`);
    console.log("Updated NOTION_ACCESS_TOKEN and NOTION_REFRESH_TOKEN in .env.");
    return;
  }

  console.log("Usage:");
  console.log("npm run oauth:url");
  console.log("npm run oauth:exchange -- --code=<code-or-full-callback-url>");
  console.log("npm run oauth:refresh");
}

function getOptionValue(args: string[], key: string): string | undefined {
  const inline = args.find((argument) => argument.startsWith(`${key}=`));

  if (inline) {
    return inline.slice(`${key}=`.length);
  }

  const index = args.indexOf(key);

  if (index >= 0) {
    return args[index + 1];
  }

  return undefined;
}

main().catch((error: unknown) => {
  console.error("OAuth helper failed.");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
});
