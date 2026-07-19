#!/bin/bash

# RPM passes 1 and Debian passes upgrade while replacing an installed package.
# Keep the new package's launcher and AppArmor profile in both cases.
case "${1:-}" in
  1 | upgrade | failed-upgrade | abort-upgrade) exit 0 ;;
esac

if command -v update-alternatives >/dev/null 2>&1; then
  update-alternatives --remove folea /opt/folea/folea
else
  rm -f /usr/bin/folea
fi

profile=/etc/apparmor.d/folea
if [ -f "$profile" ]; then
  if apparmor_status --enabled >/dev/null 2>&1 &&
    ! { [ -x /usr/bin/ischroot ] && /usr/bin/ischroot; } &&
    command -v apparmor_parser >/dev/null 2>&1; then
    apparmor_parser --remove "$profile" || true
  fi
  rm -f "$profile"
fi
