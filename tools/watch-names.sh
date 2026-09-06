#!/bin/bash
# ---------------------------------------------------------------------------
# THE WATCH: does the published repository stay free of assistants' names?
#
# The hooks refuse a commit on THIS machine. They can do nothing about a commit
# made elsewhere -- another machine, a forge's web editor, a merge done in an
# interface -- and that is exactly the route by which a signature would come
# back with nobody looking.
#
# So we look. Once a day, at what is REALLY online rather than at the local
# copy: reclone, reread, write one line. Quiet when all is well, loud when not.
#
# THIS FILE CARRIES NO NAME, AND THAT IS DELIBERATE. Its first version was
# refused by the hook because it copied the list in order to build its report
# -- two lists that drift apart is the defect half this repository spends its
# time repairing. Detection AND report both come from tools/check-ai-names.mjs,
# which is the only list.
#
# NO ABSOLUTE PATH EITHER. The name guard refused its second version for
# carrying the path of the machine that wrote it, which in a public repository
# says where somebody works. Everything is derived from where this file sits,
# and the address of the repository is read off the remote rather than copied.
# ---------------------------------------------------------------------------
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${ANNOTEPAGE_WATCH_LOG:-$REPO/../.backups/watch-names.log}"
ORIGIN="$(git -C "$REPO" remote get-url origin 2>/dev/null)"
TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"' EXIT

when=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
mkdir -p "$(dirname "$LOG")"

if [ -z "$ORIGIN" ] || ! git clone -q --bare "$ORIGIN" "$TEMP/d.git" 2>/dev/null; then
    echo "$when  UNREACHABLE: the clone failed" >> "$LOG"
    exit 1
fi

# EVERY REF, not two hardcoded branches, and the CONTENT as well as the
# messages. The first version read two branches and only their messages: it
# wrote "clean" on a day the other branch still carried nine occurrences in its
# shipped files, and it would never have seen a branch pushed from a web editor
# or a tag at all. A watch that reassures wrongly is worse than no watch.
trouble=0
refs=$(git -C "$TEMP/d.git" for-each-ref --format='%(refname:short)' refs/heads refs/tags)
[ -z "$refs" ] && { echo "$when  UNREACHABLE: no ref could be read" >> "$LOG"; exit 1; }

for b in $refs; do
    git -C "$TEMP/d.git" log --format='%an%n%ae%n%B' "$b" > "$TEMP/messages"
    if ! node "$REPO/tools/check-ai-names.mjs" message "$TEMP/messages" > "$TEMP/report" 2>&1; then
        echo "$when  ALERT: messages of $b" >> "$LOG"
        sed 's/^/    /' "$TEMP/report" >> "$LOG"
        trouble=1
    fi
    # The shipped content, by unpacking the ref's tree into a throwaway
    # directory: a file naming somebody is as public as a message doing it.
    rm -rf "$TEMP/tree"; mkdir -p "$TEMP/tree"
    git -C "$TEMP/d.git" archive "$b" | tar -x -C "$TEMP/tree" 2>/dev/null || continue
    if ! (cd "$TEMP/tree" && git init -q . && git add -A -f >/dev/null 2>&1 \
          && node "$REPO/tools/check-ai-names.mjs" > "$TEMP/report" 2>&1); then
        echo "$when  ALERT: files of $b" >> "$LOG"
        sed 's/^/    /' "$TEMP/report" >> "$LOG"
        trouble=1
    fi
done

[ "$trouble" = 0 ] && echo "$when  clean: $(echo $refs | tr '\n' ' ')" >> "$LOG"
exit "$trouble"
