# Water reflection checks

Start the development server with npm run dev.
Open /dont-sleep-with-the-fishes/scripts/water-lab/index.html?time=12&checks on that server.

The time parameter freezes waves for repeatable image comparisons.
The checks parameter runs the production reflection GLSL on the GPU.
All six checks must show PASS. WebGL errors and Shader errors must remain zero.

Check Near, Horizon, and Top cameras in Day and Night light.
Check Calm and Rough waves, quality switching, and Game post-processing.
Use Resume to check moving waves and hull reflections.

The High setting uses planar scene reflections with wave distortion.
It does not trace reflections between individual waves.

Add &storm to show rain, mist, spray, and boat splashes.
These effects stay visible directly but do not enter the water reflection capture.
Lightning remains in the reflection capture.
