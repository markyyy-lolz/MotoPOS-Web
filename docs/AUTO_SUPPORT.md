# MotoPOS Auto Support

MotoPOS Auto Support is an API-free troubleshooting engine. It does not call OpenAI or any external AI provider.

## How it works

- A customer sends a support message.
- The `support-auto-reply` Edge Function validates the signed-in user and support-thread access.
- The function matches the message against the private `support_auto_rules` knowledge base.
- A matching rule returns guided troubleshooting steps.
- If the customer replies that the issue still exists, the next troubleshooting step is returned.
- If the rule is exhausted, the issue is sensitive, or no safe match can be found after two attempts, the conversation is handed to a human MotoPOS administrator.
- Human support replies stop the automatic troubleshooting flow.

The existing `support-ai-reply` function is retained as a compatibility alias for older MotoPOS clients, but it now runs the same API-free rule engine.

No `OPENAI_API_KEY` or paid AI API is required.
