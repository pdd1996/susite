// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, initialConfig } from "./App.js";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Phase 2 admin interactions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserves local edits on conflict and reloads latest revision explicitly", async () => {
    const latestConfig = {
      ...initialConfig,
      home: {
        ...initialConfig.home,
        hero: { ...initialConfig.home.hero, title: "服务器最新标题" }
      }
    };
    let historyLoads = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/sites") && (!init?.method || init.method === "GET")) {
        return jsonResponse([
          {
            siteId: "jinyuan-20260524",
            name: "杭州金源电器",
            template: "b2b-manufacturing-v1",
            currentRevision: historyLoads > 0 ? 2 : 1
          }
        ]);
      }
      if (url.endsWith("/sites/jinyuan-20260524/revisions") && init?.method === "POST") {
        return jsonResponse({ error: "revision_conflict", currentRevision: 2 }, 409);
      }
      if (url.endsWith("/sites/jinyuan-20260524/revisions")) {
        historyLoads += 1;
        const revision = historyLoads === 1 ? 1 : 2;
        return jsonResponse([
          {
            siteId: "jinyuan-20260524",
            revision,
            schemaVersion: "1.0",
            config: revision === 1 ? initialConfig : latestConfig,
            createdBy: "operator",
            createdAt: "2026-07-15T15:00:00.000Z"
          }
        ]);
      }
      if (url.endsWith("/sites/jinyuan-20260524/assets")) return jsonResponse([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App apiBaseUrl="http://api.test" />);

    const siteButton = await screen.findByRole("button", { name: /杭州金源电器/ });
    await userEvent.click(siteButton);
    const editor = await screen.findByLabelText("SiteConfig JSON");
    const localText = JSON.stringify({
      ...initialConfig,
      home: {
        ...initialConfig.home,
        hero: { ...initialConfig.home.hero, title: "我的本地修改" }
      }
    }, null, 2);
    fireEvent.change(editor, { target: { value: localText } });
    await userEvent.click(screen.getByRole("button", { name: "保存新 Revision" }));

    expect(await screen.findByText(/版本冲突：服务器当前为 revision 2/)).toBeTruthy();
    expect((editor as HTMLTextAreaElement).value).toContain("我的本地修改");

    await userEvent.click(screen.getByRole("button", { name: "重新加载最新版本" }));
    await waitFor(() => {
      expect((editor as HTMLTextAreaElement).value).toContain("服务器最新标题");
    });
    expect(window.confirm).toHaveBeenCalled();
  });

  it("hides uploads when persistent storage is disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));

    render(<App apiBaseUrl="http://api.test" uploadsEnabled={false} />);

    expect(
      await screen.findByText("当前 IP 基线未启用持久化素材存储，素材上传已禁用。")
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "上传并复核" })).toBeNull();
  });

  it("loads a historical revision and shows deployment placeholder warnings", async () => {
    const olderConfig = {
      ...initialConfig,
      home: {
        ...initialConfig.home,
        hero: { ...initialConfig.home.hero, title: "历史版本标题" }
      }
    };
    let deploymentReads = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/sites") && (!init?.method || init.method === "GET")) {
        return jsonResponse([
          {
            siteId: "jinyuan-20260524",
            name: "杭州金源电器",
            template: "b2b-manufacturing-v1",
            currentRevision: 2
          }
        ]);
      }
      if (url.endsWith("/sites/jinyuan-20260524/revisions")) {
        return jsonResponse([
          {
            siteId: "jinyuan-20260524",
            revision: 2,
            schemaVersion: "1.0",
            config: initialConfig,
            createdBy: "operator",
            createdAt: "2026-07-15T16:00:00.000Z"
          },
          {
            siteId: "jinyuan-20260524",
            revision: 1,
            schemaVersion: "1.0",
            config: olderConfig,
            createdBy: "operator",
            createdAt: "2026-07-15T15:00:00.000Z"
          }
        ]);
      }
      if (url.endsWith("/sites/jinyuan-20260524/assets")) return jsonResponse([]);
      if (url.endsWith("/sites/jinyuan-20260524/deployments") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toMatchObject({ revision: 1 });
        return jsonResponse(
          {
            jobId: "job_1",
            revision: 1,
            status: "queued",
            placeholderAssetIds: ["asset_placeholder_logo"]
          },
          202
        );
      }
      if (url.endsWith("/sites/jinyuan-20260524/deployments/job_1")) {
        deploymentReads += 1;
        return jsonResponse({
          jobId: "job_1",
          revision: 1,
          status: "healthy",
          placeholderAssetIds: ["asset_placeholder_logo"],
          previewUrl: "https://jinyuan-20260524.preview.example.test"
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App apiBaseUrl="http://api.test" />);

    await userEvent.click(await screen.findByRole("button", { name: /杭州金源电器/ }));
    const historyButtons = await screen.findAllByRole("button", { name: "加载此版本" });
    await userEvent.click(historyButtons[1]!);
    expect((screen.getByLabelText("SiteConfig JSON") as HTMLTextAreaElement).value).toContain(
      "历史版本标题"
    );

    await userEvent.click(screen.getByRole("button", { name: "创建预览" }));
    expect(await screen.findByText(/本次预览包含已批准占位素材：asset_placeholder_logo/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "刷新任务状态" }));
    expect((await screen.findByRole("link", { name: "打开预览" })).getAttribute("href")).toBe(
      "https://jinyuan-20260524.preview.example.test"
    );
    expect(deploymentReads).toBe(1);
  });

  it("shows reliability state, events, retry details and confirms rollback", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/sites") && (!init?.method || init.method === "GET")) {
        return jsonResponse([{
          siteId: "jinyuan-20260524",
          name: "杭州金源电器",
          template: "b2b-manufacturing-v1",
          currentRevision: 2
        }]);
      }
      if (url.endsWith("/revisions")) {
        return jsonResponse([{
          siteId: "jinyuan-20260524",
          revision: 2,
          schemaVersion: "1.0",
          config: initialConfig,
          createdBy: "operator",
          createdAt: "2026-07-16T10:00:00.000Z"
        }]);
      }
      if (url.endsWith("/assets")) return jsonResponse([]);
      if (url.endsWith("/preview-state")) {
        return jsonResponse({
          activeArtifactId: "artifact_a",
          activeDeploymentId: "deployment_a",
          revision: 1,
          previewUrl: "https://preview.test",
          version: 1,
          activatedAt: "2026-07-16T10:01:00.000Z"
        });
      }
      if (url.endsWith("/artifacts")) {
        return jsonResponse([
          { artifactId: "artifact_a", revision: 1, templateVersion: "1.0.0", createdAt: "2026-07-16T10:00:00.000Z" },
          { artifactId: "artifact_b", revision: 2, templateVersion: "1.0.0", createdAt: "2026-07-16T11:00:00.000Z" }
        ]);
      }
      if (url.endsWith("/deployments") && init?.method === "POST") {
        return jsonResponse({
          jobId: "job_retry",
          revision: 2,
          kind: "publish",
          status: "retry_waiting",
          attemptCount: 1,
          maxAttempts: 3,
          nextAttemptAt: "2026-07-16T11:00:05.000Z",
          lastErrorCode: "storage_unavailable",
          placeholderAssetIds: []
        }, 202);
      }
      if (url.endsWith("/deployments/job_retry")) {
        return jsonResponse({
          jobId: "job_retry",
          revision: 2,
          kind: "publish",
          status: "retry_waiting",
          attemptCount: 1,
          maxAttempts: 3,
          nextAttemptAt: "2026-07-16T11:00:05.000Z",
          lastErrorCode: "storage_unavailable",
          placeholderAssetIds: []
        });
      }
      if (url.endsWith("/deployments/job_retry/events")) {
        return jsonResponse([{
          eventId: "event_1",
          attempt: 1,
          sequence: 2,
          stage: "retry_scheduled",
          level: "warn",
          code: "storage_unavailable",
          message: "对象存储暂时不可用",
          createdAt: "2026-07-16T11:00:00.000Z"
        }]);
      }
      if (url.endsWith("/rollbacks") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toMatchObject({ artifactId: "artifact_b" });
        return jsonResponse({
          jobId: "job_rollback",
          revision: 2,
          kind: "rollback",
          status: "queued",
          placeholderAssetIds: []
        }, 202);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App apiBaseUrl="http://api.test" />);

    await userEvent.click(await screen.findByRole("button", { name: /杭州金源电器/ }));
    expect(await screen.findByRole("link", { name: "打开当前预览" })).toBeTruthy();
    const rollbackButtons = screen.getAllByRole("button", { name: "回滚到此版本" });
    expect((rollbackButtons[0] as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(rollbackButtons[1]!);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("artifact_b"));
    expect(await screen.findByText(/回滚任务已创建：job_rollback/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "创建预览" }));
    await userEvent.click(screen.getByRole("button", { name: "刷新任务状态" }));
    expect(await screen.findByText(/attempt 1\/3/)).toBeTruthy();
    expect(await screen.findByText(/retry_scheduled/)).toBeTruthy();
  });

  it("records preview sending and customer confirmation in the review timeline", async () => {
    let contentStatus = "draft";
    const reviews: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/sites") && (!init?.method || init.method === "GET")) {
        return jsonResponse([{
          siteId: "jinyuan-20260524",
          name: "杭州金源电器",
          template: "b2b-manufacturing-v1",
          currentRevision: 1
        }]);
      }
      if (url.endsWith("/revisions")) {
        return jsonResponse([{
          siteId: "jinyuan-20260524",
          revision: 1,
          schemaVersion: "1.0",
          config: initialConfig,
          contentStatus,
          createdBy: "operator",
          createdAt: "2026-07-17T08:00:00.000Z"
        }]);
      }
      if (url.endsWith("/assets") || url.endsWith("/artifacts")) return jsonResponse([]);
      if (url.endsWith("/preview-state")) return jsonResponse({ error: "preview_state_not_found" }, 404);
      if (url.endsWith("/reviews") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const outcome = body.kind === "preview_sent" ? "pending" : "approved";
        contentStatus = body.kind === "preview_sent" ? "review_requested" : "approved";
        const record = {
          reviewId: `review_${reviews.length + 1}`,
          revision: 1,
          deploymentId: body.deploymentId,
          kind: body.kind,
          outcome,
          channel: body.channel,
          previewUrl: "https://preview.test",
          note: body.note,
          recordedBy: "operator",
          recordedAt: `2026-07-17T08:0${reviews.length + 1}:00.000Z`
        };
        reviews.push(record);
        return jsonResponse({ kind: "created", record, revision: { contentStatus } }, 201);
      }
      if (url.endsWith("/reviews")) return jsonResponse(reviews);
      if (url.endsWith("/deployments") && init?.method === "POST") {
        return jsonResponse({
          deploymentId: "deployment_review",
          jobId: "job_review",
          revision: 1,
          status: "healthy",
          placeholderAssetIds: [],
          previewUrl: "https://preview.test"
        }, 202);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App apiBaseUrl="http://api.test" />);

    await userEvent.click(await screen.findByRole("button", { name: /杭州金源电器/ }));
    await userEvent.click(screen.getByRole("button", { name: "创建预览" }));
    await userEvent.type(screen.getByLabelText("审核备注"), "微信发送首稿");
    await userEvent.click(screen.getByRole("button", { name: "记录预览已发送" }));
    expect(await screen.findByText(/preview_sent.*微信发送首稿/)).toBeTruthy();
    expect(screen.getByText(/内容状态：review_requested/)).toBeTruthy();

    await userEvent.type(screen.getByLabelText("审核备注"), "客户确认通过");
    await userEvent.click(screen.getByRole("button", { name: "记录客户确认" }));
    expect(await screen.findByText(/customer_confirmed.*客户确认通过/)).toBeTruthy();
    expect(screen.getByText(/内容状态：approved/)).toBeTruthy();
  });
});
