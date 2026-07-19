class Folea < Formula
  desc "Keyboard-driven, minimalist note manager for Typst notes"
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
  end

  test do
    assert_match "SOURCE_COMMIT=", shell_output("#{bin}/folea --build-info")
    assert_predicate prefix/"folea.app", :directory?
  end
end
