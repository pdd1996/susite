#!/bin/sh
set -eu

source_file="/run/zhansite-auth/.htpasswd"
target_directory="/etc/nginx/auth"
target_file="${target_directory}/.htpasswd"

if [ ! -s "${source_file}" ]; then
  echo "Basic Auth credential file is missing or empty: ${source_file}" >&2
  exit 1
fi

mkdir -p "${target_directory}"
cp "${source_file}" "${target_file}"
chown root:nginx "${target_directory}" "${target_file}"
chmod 750 "${target_directory}"
chmod 640 "${target_file}"
