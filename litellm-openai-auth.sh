docker compose exec litellm python -c "from litellm.llms.chatgpt.authenticator import Authenticator; Authenticator().get_access_token()"
