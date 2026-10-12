# Visual history of AETHER Fx

These images record early renders of *The Little Light*, the included illustrated short. They show visual development within the experimental 0.x.x version, rather than separate published releases.

## First render

![Early frames from The Little Light](../assets/first-born.png)

## Preview refinement

![Refined frames from The Little Light](../assets/first-preview.png)

The character was later corrected with a neck bridge connecting the head and torso. The images above predate that correction. Run the [current demo](quickstart.md#preview-the-included-animation) to see the checked-in animation, or read [release readiness](../RELEASE-READINESS.md#corrected-acceptance-short) for the correction and its recorded verification.

## Redesing the Render, introduce the Render 3D

![Refined render and introduce the first render 3D](../assets/first-render-3d.png)

## Before and After

![Before and After, introduce the first render 3D](../assets/before-after.png)

## Articulated reach and a visible grip

The [authored short](../fixtures/short/little-light-authored.afx) now uses fixed-contour upper and forearm parts with authored rotations, coordinated head/torso poses and planted feet. Open, closing and holding hand drawings place the palm behind the handle and the fingers/thumb in front. The handle crown and curled-finger landmark lie on the drawn surfaces; matching anchors alone is not the visual acceptance criterion. The parametric table gains a clearer cap, end face and supporting apron, while the window and final caption leave room for the gesture.

![Hand approaching, closing around the handle and carrying the lamp at labeled global and local frames](../assets/grip-detail.png)

`G` labels global frames and `L` labels frames local to the named shot. G174 is `reachAndLift` L30, before contact: the open hand is still approaching. Closing begins at G194/L50, binding occurs at G204/L60, and the lamp remains supported through G216/L72 before lifting. The finger/thumb drawings show the handle being held during the lift. The final grip continues through the G336 `keep` shot boundary. A settling pose was added at G274–G298 within the existing pause; duration remains 480 frames at 24 fps, with the original audio and camera tracks.

Native MP4 decode, absolute-frame seeking and critical-frame preview/Skia comparisons were checked locally. This sheet documents progress in this short, rather than universal contact stability, all-frame raster parity or a published release.
