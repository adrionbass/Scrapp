#include <windows.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

namespace {
constexpr std::size_t kFooterSize = 552;
constexpr char kMagic[] = "SCRAPP_BUNDLE_V1";

void debugLog(const wchar_t* message) {
  std::array<wchar_t, 2> enabled{};
  if (GetEnvironmentVariableW(L"SCRAPP_LAUNCHER_DEBUG", enabled.data(), enabled.size()) == 0) return;
  std::array<wchar_t, MAX_PATH> base{};
  if (!GetTempPathW(static_cast<DWORD>(base.size()), base.data())) return;
  const std::filesystem::path logPath = std::filesystem::path(base.data()) / L"scrapp-launcher-debug.log";
  HANDLE file = CreateFileW(logPath.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ, nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) return;
  DWORD written = 0;
  WriteFile(file, message, static_cast<DWORD>(wcslen(message) * sizeof(wchar_t)), &written, nullptr);
  WriteFile(file, L"\r\n", 4, &written, nullptr);
  CloseHandle(file);
}

std::wstring utf8ToWide(const char* value) {
  const int length = MultiByteToWideChar(CP_UTF8, 0, value, -1, nullptr, 0);
  if (length <= 0) return {};
  std::wstring result(static_cast<std::size_t>(length), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, value, -1, result.data(), length);
  result.resize(static_cast<std::size_t>(length - 1));
  return result;
}

std::wstring quote(const std::wstring& value) {
  return L"\"" + value + L"\"";
}

bool writeSegment(
    std::ifstream& source,
    std::uint64_t offset,
    std::uint64_t size,
    const std::filesystem::path& destination) {
  source.clear();
  source.seekg(static_cast<std::streamoff>(offset), std::ios::beg);
  std::ofstream output(destination, std::ios::binary | std::ios::trunc);
  if (!source || !output) return false;

  std::array<char, 64 * 1024> buffer{};
  while (size > 0) {
    const auto chunk = static_cast<std::streamsize>(std::min<std::uint64_t>(buffer.size(), size));
    source.read(buffer.data(), chunk);
    if (source.gcount() != chunk) return false;
    output.write(buffer.data(), chunk);
    if (!output) return false;
    size -= static_cast<std::uint64_t>(chunk);
  }
  return true;
}

bool runAndWait(
    const std::filesystem::path& executable,
    const std::wstring& arguments,
    const std::filesystem::path& workingDirectory,
    DWORD creationFlags,
    DWORD* exitCode = nullptr) {
  std::wstring command = quote(executable.wstring());
  if (!arguments.empty()) command += L" " + arguments;
  std::vector<wchar_t> mutableCommand(command.begin(), command.end());
  mutableCommand.push_back(L'\0');

  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION process{};
  if (!CreateProcessW(
          executable.c_str(), mutableCommand.data(), nullptr, nullptr, FALSE, creationFlags,
          nullptr, workingDirectory.c_str(), &startup, &process)) {
    return false;
  }

  WaitForSingleObject(process.hProcess, INFINITE);
  DWORD result = 1;
  GetExitCodeProcess(process.hProcess, &result);
  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  if (exitCode) *exitCode = result;
  return true;
}

std::filesystem::path createTemporaryDirectory() {
  std::array<wchar_t, MAX_PATH> base{};
  if (!GetTempPathW(static_cast<DWORD>(base.size()), base.data())) return {};
  std::array<wchar_t, MAX_PATH> candidate{};
  if (!GetTempFileNameW(base.data(), L"scr", 0, candidate.data())) return {};
  DeleteFileW(candidate.data());
  if (!CreateDirectoryW(candidate.data(), nullptr)) return {};
  return candidate.data();
}

bool removeTree(const std::filesystem::path& directory) {
  const std::wstring pattern = (directory / L"*").wstring();
  WIN32_FIND_DATAW item{};
  HANDLE search = FindFirstFileW(pattern.c_str(), &item);
  if (search != INVALID_HANDLE_VALUE) {
    do {
      if (wcscmp(item.cFileName, L".") == 0 || wcscmp(item.cFileName, L"..") == 0) continue;
      const auto child = directory / item.cFileName;
      if ((item.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) {
        if ((item.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
          RemoveDirectoryW(child.c_str());
        } else {
          removeTree(child);
        }
      } else {
        SetFileAttributesW(child.c_str(), FILE_ATTRIBUTE_NORMAL);
        DeleteFileW(child.c_str());
      }
    } while (FindNextFileW(search, &item));
    FindClose(search);
  }
  SetFileAttributesW(directory.c_str(), FILE_ATTRIBUTE_NORMAL);
  return RemoveDirectoryW(directory.c_str()) != FALSE;
}

int fail(const std::filesystem::path& temporaryDirectory = {}) {
  if (!temporaryDirectory.empty()) removeTree(temporaryDirectory);
  MessageBoxW(nullptr, L"No se pudo abrir la aplicación.", L"Scrapp", MB_OK | MB_ICONERROR);
  return 1;
}
}  // namespace

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
  debugLog(L"start");
  std::array<wchar_t, 32768> modulePath{};
  const DWORD moduleLength = GetModuleFileNameW(nullptr, modulePath.data(), static_cast<DWORD>(modulePath.size()));
  if (moduleLength == 0 || moduleLength == modulePath.size()) return fail();

  const std::filesystem::path self(modulePath.data());
  std::ifstream input(self, std::ios::binary | std::ios::ate);
  if (!input) return fail();
  const auto fileSize = static_cast<std::uint64_t>(input.tellg());
  if (fileSize < kFooterSize) return fail();

  std::array<char, kFooterSize> footer{};
  input.seekg(static_cast<std::streamoff>(fileSize - kFooterSize), std::ios::beg);
  input.read(footer.data(), footer.size());
  if (!input || std::memcmp(footer.data(), kMagic, 16) != 0) return fail();
  debugLog(L"footer-read");

  std::uint64_t launcherSize = 0;
  std::uint64_t sevenZipSize = 0;
  std::uint64_t archiveSize = 0;
  std::memcpy(&launcherSize, footer.data() + 16, sizeof(launcherSize));
  std::memcpy(&sevenZipSize, footer.data() + 24, sizeof(sevenZipSize));
  std::memcpy(&archiveSize, footer.data() + 32, sizeof(archiveSize));
  footer.back() = '\0';
  const std::wstring entry = utf8ToWide(footer.data() + 40);
  if (entry.empty() || launcherSize + sevenZipSize + archiveSize + kFooterSize != fileSize) return fail();

  const auto temporaryDirectory = createTemporaryDirectory();
  if (temporaryDirectory.empty()) return fail();
  const auto sevenZipPath = temporaryDirectory / L"7zr.exe";
  const auto archivePath = temporaryDirectory / L"payload.7z";
  const auto contentPath = temporaryDirectory / L"content";
  std::filesystem::create_directory(contentPath);

  if (!writeSegment(input, launcherSize, sevenZipSize, sevenZipPath) ||
      !writeSegment(input, launcherSize + sevenZipSize, archiveSize, archivePath)) {
    return fail(temporaryDirectory);
  }
  debugLog(L"payload-written");
  input.close();

  DWORD extractionCode = 1;
  const std::wstring extractionArguments =
      L"x " + quote(archivePath.wstring()) + L" -o" + quote(contentPath.wstring()) + L" -y";
  if (!runAndWait(sevenZipPath, extractionArguments, temporaryDirectory, CREATE_NO_WINDOW, &extractionCode) ||
      extractionCode != 0) {
    return fail(temporaryDirectory);
  }
  debugLog(L"payload-extracted");

  std::error_code ignored;
  std::filesystem::remove(sevenZipPath, ignored);
  std::filesystem::remove(archivePath, ignored);

  const auto applicationPath = contentPath / std::filesystem::path(entry);
  if (!std::filesystem::exists(applicationPath)) return fail(temporaryDirectory);
  debugLog(L"application-found");
  DWORD applicationCode = 1;
  if (!runAndWait(applicationPath, L"", applicationPath.parent_path(), 0, &applicationCode)) {
    return fail(temporaryDirectory);
  }
  debugLog(L"application-finished");

  debugLog(L"cleanup-start");
  for (int attempt = 0; attempt < 5; ++attempt) {
    if (removeTree(temporaryDirectory)) break;
    Sleep(200);
  }
  debugLog(L"cleanup-finished");
  return static_cast<int>(applicationCode);
}
