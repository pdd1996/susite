#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deploy_dir="${repo_root}/deploy"
env_file="${deploy_dir}/.env"
secret_dir="${deploy_dir}/secrets"
public_ip="${PUBLIC_IP:-118.196.82.13}"

if [[ -e "${env_file}" ]]; then
  echo "${env_file} 已存在；为避免覆盖凭据，本次未修改。" >&2
  exit 1
fi

if ! command -v openssl >/dev/null || ! command -v htpasswd >/dev/null; then
  echo "缺少 openssl 或 htpasswd，请先运行 bootstrap-ubuntu.sh。" >&2
  exit 1
fi

read -r -p "临时访问用户名 [operator]: " admin_user
admin_user="${admin_user:-operator}"
if [[ ! "${admin_user}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "用户名只能包含字母、数字、点、下划线和连字符。" >&2
  exit 1
fi

umask 077
install -d -m 700 "${secret_dir}"
echo "请设置临时访问密码（bcrypt，仅写入 deploy/secrets/.htpasswd）："
htpasswd -cB "${secret_dir}/.htpasswd" "${admin_user}"

db_password="$(openssl rand -hex 24)"
mysql_root_password="$(openssl rand -hex 24)"
upload_token_secret="$(openssl rand -hex 32)"

cat > "${env_file}" <<EOF
PUBLIC_IP=${public_ip}
ADMIN_ORIGIN=http://${public_ip}
HTTP_PORT=80
DEV_ACTOR_ID=server-operator
DB_PASSWORD=${db_password}
MYSQL_ROOT_PASSWORD=${mysql_root_password}
UPLOAD_TOKEN_SECRET=${upload_token_secret}
EOF

chmod 600 "${env_file}" "${secret_dir}/.htpasswd"
echo "已生成 ${env_file} 和 Basic Auth 凭据文件。请勿提交或发送这些文件。"
