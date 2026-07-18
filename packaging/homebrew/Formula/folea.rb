require "etc"

class Folea < Formula
  desc "Development build of the keyboard-driven Typst note reader"
  homepage "https://github.com/ivanovanatoliy/folea"
  head "https://github.com/ivanovanatoliy/folea.git", branch: "develop"
  license "Apache-2.0"

  depends_on "node@22" => :build

  def install
    ENV.prepend_path "PATH", Formula["node@22"].opt_bin
    ENV["CSC_IDENTITY_AUTO_DISCOVERY"] = "false"
    ENV["FOLEA_SOURCE_BRANCH"] = "develop"

    development_version = Utils.safe_popen_read("node", "scripts/prepare-development-build.mjs").strip
    system "npm", "ci"
    system "npm", "version", development_version, "--no-git-tag-version", "--allow-same-version"
    system "npm", "run", "build"
    system "npx", "electron-builder", "--dir", "--mac", "--#{Hardware::CPU.arm? ? "arm64" : "x64"}", "--publish", "never"

    app = Dir["dist/**/folea.app"].first
    odie "electron-builder did not produce folea.app" unless app

    system "ditto", "-c", "-k", "--keepParent", app, prefix/"folea.app.zip"
    (bin/"folea").write <<~SH
      #!/bin/sh
      exec "#{prefix}/folea.app/Contents/MacOS/folea" "$@"
    SH
  end

  def post_install
    system "ditto", "-x", "-k", prefix/"folea.app.zip", prefix
    rm prefix/"folea.app.zip"
    system "codesign", "--force", "--deep", "--sign", "-", prefix/"folea.app"

    applications = Pathname(Etc.getpwuid.dir)/"Applications"
    applications.mkpath
    app_alias = applications/"Folea Dev.app"
    rm_f app_alias
    system "osascript", "-l", "JavaScript", "-e", <<~JAVASCRIPT
      ObjC.import("Foundation");
      const target = $.NSURL.fileURLWithPath(#{(prefix/"folea.app").to_s.dump});
      const alias = $.NSURL.fileURLWithPath(#{app_alias.to_s.dump});
      const data = target.bookmarkDataWithOptionsIncludingResourceValuesForKeysRelativeToURLError(
        $.NSURLBookmarkCreationSuitableForBookmarkFile, $(), $(), $()
      );
      if (!data || !$.NSURL.writeBookmarkDataToURLOptionsError(data, alias, 0, $())) {
        throw new Error("Could not create Spotlight alias");
      }
    JAVASCRIPT
  end

  test do
    assert_match "SOURCE_COMMIT=", shell_output("#{bin}/folea --build-info")
    assert_predicate prefix/"folea.app", :directory?
  end
end
