#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="${repo_root}/deploy/compose.ip-baseline.yml"
env_file="${repo_root}/deploy/.env"
htpasswd_file="${repo_root}/deploy/secrets/.htpasswd"

if [[ ! -f "${env_file}" || ! -s "${htpasswd_file}" ]]; then
  echo "缺少部署环境或 Basic Auth 凭据，请先运行 deploy/scripts/prepare-env.sh。" >&2
  exit 1
fi

cd "${repo_root}"
compose=(docker compose --env-file "${env_file}" -f "${compose_file}")

"${compose[@]}" config --quiet
"${compose[@]}" up -d --build --remove-orphans
"${compose[@]}" ps

public_ip="$(awk -F= '$1 == "PUBLIC_IP" { print $2 }' "${env_file}")"
http_port="$(awk -F= '$1 == "HTTP_PORT" { print $2 }' "${env_file}")"
url="http://${public_ip}"
if [[ "${http_port:-80}" != "80" ]]; then
  url="${url}:${http_port}"
fi

status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "${url}/" || true)"
if [[ "${status}" != "401" ]]; then
  echo "网关未返回预期的 Basic Auth 401（实际 ${status:-无响应}）。" >&2
  echo "请检查：${compose[*]} logs --tail=200" >&2
  exit 1
fi

echo "部署完成：${url}"
echo "该地址是无 HTTPS 的受控演示基线；真实预览发布、素材上传和发布 Worker 尚未启用。"
