# Enrich one person by social URL. Key comes from the environment, never this file:
#   set -a; source ~/.secrets; set +a; python3 enrich-people.py https://linkedin.com/in/t3gg
# Requires: pip install context.dev
import json, os, sys
from context.dev import ContextDev

client = ContextDev(api_key=os.environ["CONTEXT_DEV_API_KEY"])
urls = sys.argv[1:] or ["https://linkedin.com/in/t3gg"]
response = client.people.enrich(social_urls=urls)
print(response)
