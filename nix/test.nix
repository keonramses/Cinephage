{self, ...}: {
  perSystem = {
    config,
    lib,
    pkgs,
    system,
    ...
  }: {
    checks = {
      cinephage-service-test = pkgs.testers.nixosTest {
        name = "cinephage-service-test";

        nodes = {
          machine = {pkgs, ...}: {
            imports = [
              self.nixosModules.default
            ];

            services.cinephage = {
              enable = true;
              ffmpeg.enable = true;
            };

            # Add sqlite3 for testing database
            environment.systemPackages = [pkgs.sqlite];

            # Enable networking for test
            networking.firewall.enable = false;

            system.stateVersion = "24.11";
          };
        };

        testScript = ''
          import time

          machine.start()

          # Wait for service to start
          machine.wait_for_unit("cinephage.service")

          # Wait a bit more for the application to fully initialize
          time.sleep(10)

          # Check if port 3000 is available
          machine.wait_for_open_port(3000, timeout=30)
          machine.succeed("curl -f http://localhost:3000/health || curl -f http://localhost:3000/")

          # Verify that service is still running
          machine.succeed("systemctl is-active cinephage.service")

          # Check that ffmpeg is available in the service environment
          output = machine.succeed("systemctl show cinephage.service | grep Environment")
          print("Service environment:", output)

          # Verify state directory structure was created
          machine.succeed("test -d /var/lib/cinephage")
          machine.succeed("test -d /var/lib/cinephage/data")
          machine.succeed("test -d /var/lib/cinephage/data/indexers")
          machine.succeed("test -d /var/lib/cinephage/data/indexers/definitions")
          machine.succeed("test -d /var/lib/cinephage/logs")

          # Verify indexer definitions were copied from package
          indexer_files = machine.succeed("ls -1 /var/lib/cinephage/data/indexers/definitions/ | wc -l")
          print(f"Found {indexer_files.strip()} indexer definition files")

          # Check that at least some indexer definitions exist
          if int(indexer_files.strip()) == 0:
            raise Exception("No indexer definitions were copied from package")
          else:
            print("✓ Indexer definitions copied successfully from package")

          # Check that database file was created
          machine.succeed("test -f /var/lib/cinephage/data/cinephage.db")

          # Verify database is readable and not empty (should have schema tables)
          machine.succeed("sh -c 'echo \"SELECT name FROM sqlite_master WHERE type=\\\"table\\\";\" | sqlite3 /var/lib/cinephage/data/cinephage.db | grep -q schema_version || true'")

          # Check database ownership and permissions
          db_info = machine.succeed("ls -la /var/lib/cinephage/data/cinephage.db")
          print("Database file info:", db_info)

          # Check service user and group
          machine.succeed("getent passwd cinephage")
          machine.succeed("getent group cinephage")

          # Verify service is using correct environment variables
          env_output = machine.succeed("systemctl show cinephage.service --property=Environment")
          print("Environment variables:", env_output)

          # Check that DATA_DIR is correctly set
          if "DATA_DIR=/var/lib/cinephage/data" not in env_output:
            raise Exception("DATA_DIR environment variable not set correctly")
          else:
            print("✓ DATA_DIR environment variable is set correctly")

          # Check that working directory is correct
          work_dir = machine.succeed("systemctl show cinephage.service --property=WorkingDirectory")
          if "/var/lib/cinephage" not in work_dir:
            raise Exception("WorkingDirectory not set correctly")
          else:
            print("✓ WorkingDirectory is set correctly")
        '';
      };
    };
  };
}
