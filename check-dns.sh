#!/usr/bin/env bash
# Verifies the mypaira.com cutover to Cloudflare Pages and confirms the
# Microsoft 365 mail records are intact. Read-only; safe to run at any time.

DOMAIN='mypaira.com'
TARGET='paira-2hm.pages.dev'
WIX_IP='185.230.63.107'

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$1"; }

echo "=============================================="
echo " PAIRA cutover check — $(date '+%Y-%m-%d %H:%M')"
echo "=============================================="

echo
echo "--- 1. www CNAME ---"
WWW=$(dig +short www.$DOMAIN CNAME | head -1)
echo "www.$DOMAIN -> ${WWW:-<none>}"
if [[ "$WWW" == "$TARGET." ]]; then
  green "OK: www points at Cloudflare Pages."
elif [[ "$WWW" == *"wixdns"* ]]; then
  yellow "PENDING: www still points at Wix. (Step 1 not done, or still propagating.)"
else
  yellow "Unexpected value — check GoDaddy DNS."
fi

echo
echo "--- 2. SSL certificate for www ---"
CERT=$(echo | openssl s_client -servername www.$DOMAIN -connect www.$DOMAIN:443 2>/dev/null \
       | openssl x509 -noout -subject -issuer -dates 2>/dev/null)
if [[ -n "$CERT" ]]; then
  echo "$CERT"
  if echo "$CERT" | grep -qi 'google trust\|lets encrypt\|cloudflare'; then
    green "OK: a valid certificate is being served."
  fi
else
  yellow "PENDING: no certificate yet. Cloudflare is still issuing it — wait a few minutes."
fi

echo
echo "--- 3. HTTPS response from www ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://www.$DOMAIN/" 2>/dev/null)
echo "https://www.$DOMAIN/ -> HTTP $CODE"
[[ "$CODE" == "200" || "$CODE" == "30"* ]] && green "OK: site is responding." \
  || yellow "Not serving yet (expected until Steps 1-2 finish)."

echo
echo "--- 4. Apex domain redirect ---"
APEX_IP=$(dig +short $DOMAIN A | head -1)
echo "$DOMAIN -> ${APEX_IP:-<none>}"
if [[ "$APEX_IP" == "$WIX_IP" ]]; then
  yellow "PENDING: apex still points at Wix. (Step 3 not done.)"
else
  REDIR=$(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' --max-time 15 "http://$DOMAIN/" 2>/dev/null)
  echo "http://$DOMAIN/ => $REDIR"
  echo "$REDIR" | grep -q "www.$DOMAIN" && green "OK: apex redirects to www." \
    || yellow "Apex is not redirecting to www yet."
fi

echo
echo "--- 5. EMAIL RECORDS (must be unchanged) ---"
MX=$(dig +short $DOMAIN MX | head -1)
echo "MX:     ${MX:-<NONE>}"
if echo "$MX" | grep -q 'mail.protection.outlook.com'; then
  green "OK: Microsoft 365 MX intact."
else
  red "*** ALERT: MX record is wrong or missing — EMAIL IS BROKEN. ***"
  red "*** Restore: MX priority 0 -> mypaira-com.mail.protection.outlook.com ***"
fi

SPF=$(dig +short $DOMAIN TXT | grep -i 'spf1')
echo "SPF:    ${SPF:-<NONE>}"
echo "$SPF" | grep -q 'secureserver.net' && green "OK: SPF intact." \
  || red "*** ALERT: SPF missing — outbound mail may be marked as spam. ***"

AUTO=$(dig +short autodiscover.$DOMAIN CNAME | head -1)
echo "autodiscover: ${AUTO:-<NONE>}"
echo "$AUTO" | grep -q 'outlook.com' && green "OK: autodiscover intact." \
  || red "*** ALERT: autodiscover missing — Outlook clients may fail to connect. ***"

echo
echo "=============================================="
echo "Rollback if needed:"
echo "  www   CNAME -> pointing.wixdns.net"
echo "  @     A     -> $WIX_IP   (and delete the Forwarding rule)"
echo "=============================================="
