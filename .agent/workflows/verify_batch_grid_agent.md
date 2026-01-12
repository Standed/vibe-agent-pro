---
description: Verify Batch Grid Generation in Agent Mode
---

# Verification Steps for Batch Grid Generation

1.  **Preparation**
    *   Open the Vibe Agent Pro application.
    *   Load a project that has at least one scene with multiple shots (4-9 shots recommended for testing grid).
    *   Ensure the project has defined characters with reference images to test consistency.

2.  **Trigger Batch Generation**
    *   Switch to **Agent Mode** (Director View).
    *   In the chat input, type a command like: "为当前场景生成 Grid 图片" (Generate grid images for current scene).
    *   Alternatively, use the command: "批量生成项目图片" (Batch generate project images) to test project-wide generation.

3.  **Monitor Progress**
    *   Observe the Agent's progress indicator.
    *   **Verify**: The progress messages should be in **Chinese** (e.g., "正在生成 Grid 批次 1/1...", "正在处理场景...").
    *   **Verify**: The Agent should group shots into batches (e.g., 4 shots for 2x2, 9 shots for 3x3).

4.  **Verify Results (Visual)**
    *   Wait for the generation to complete.
    *   **Verify**: Each shot in the scene should now have an image assigned.
    *   **Verify**: The assigned images should be individual slices, not the full grid.
    *   **Verify**: The characters in the images should match the project's character reference images (Character Consistency).

5.  **Verify Data & History**
    *   Click on one of the generated shots to open the **Shot Detail** view (or look at the Inspector).
    *   **Verify**: The `referenceImage` should be the **first slice** of the grid (or the slice corresponding to the shot's position).
    *   Check the **Generation History** tab for the shot.
    *   **Verify**: You should see an entry for the Grid generation.
    *   **Verify**: The history item should show the **Full Grid** image.
    *   **Verify**: You should be able to see/select other slices from this history item (if the UI supports it, or at least see the data is there).

6.  **Verify Persistence**
    *   Refresh the page.
    *   **Verify**: The images and history should persist.
