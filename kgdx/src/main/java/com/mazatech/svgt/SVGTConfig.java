/****************************************************************************
** Copyright (c) 2013-2023 Mazatech S.r.l.
** All rights reserved.
** 
** This file is part of AmanithSVG software, an SVG rendering library.
** 
** Redistribution and use in source and binary forms, with or without
** modification, are permitted (subject to the limitations in the disclaimer
** below) provided that the following conditions are met:
** 
** - Redistributions of source code must retain the above copyright notice,
**   this list of conditions and the following disclaimer.
** 
** - Redistributions in binary form must reproduce the above copyright notice,
**   this list of conditions and the following disclaimer in the documentation
**   and/or other materials provided with the distribution.
** 
** - Neither the name of Mazatech S.r.l. nor the names of its contributors
**   may be used to endorse or promote products derived from this software
**   without specific prior written permission.
** 
** NO EXPRESS OR IMPLIED LICENSES TO ANY PARTY'S PATENT RIGHTS ARE GRANTED
** BY THIS LICENSE. THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND
** CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT
** NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
** A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER
** OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
** EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
** PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
** OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
** WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
** OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
** ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
** 
** For any information, please contact info@mazatech.com
** 
****************************************************************************/

package com.mazatech.svgt;

public enum SVGTConfig {

    CurvesQuality(AmanithSVGJNI.SVGT_CONFIG_CURVES_QUALITY),
    MaxCurrentThreads(AmanithSVGJNI.SVGT_CONFIG_MAX_CURRENT_THREADS),
    MaxSurfaceDimension(AmanithSVGJNI.SVGT_CONFIG_MAX_SURFACE_DIMENSION);

    SVGTConfig(int svgtEnum) {

        _svgtEnum = svgtEnum;
    }

    public int getValue() {

        return _svgtEnum;
    }

    public static SVGTConfig fromValue(int svgtEnum) {

        return _allValues[svgtEnum];
    }

    private final int _svgtEnum;
    private static final SVGTConfig[] _allValues = values();
}
