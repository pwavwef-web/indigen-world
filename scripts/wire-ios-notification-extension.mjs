// Deterministic, idempotent project wiring. No signing credentials or packages.
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'apps/mobile/ios/Runner.xcodeproj/project.pbxproj';
let source = readFileSync(path, 'utf8');
if (source.includes('A90000000000000000000001 /* NotificationService */')) { console.log('NotificationService target already wired.'); process.exit(0); }
const code = (n) => `A9${n.toString(16).toUpperCase().padStart(22, '0')}`;
const target=code(1), product=code(2), swift=code(3), plist=code(4), group=code(5), srcBuild=code(6), embedBuild=code(7), sources=code(8), frameworks=code(9), resources=code(10), configs=code(11), proxy=code(12), dep=code(13), embed=code(14);
function section(name,text) { const marker = `/* End ${name} section */`; if (!source.includes(marker)) throw Error(`Missing ${name}`); source=source.replace(marker,text+'\n'+marker); }
section('PBXBuildFile',`${srcBuild} /* NotificationService.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${swift}; };\n${embedBuild} /* NotificationService.appex in Embed App Extensions */ = {isa = PBXBuildFile; fileRef = ${product}; settings = {ATTRIBUTES = (RemoveHeadersOnCopy, ); }; };`);
section('PBXFileReference',`${product} /* NotificationService.appex */ = {isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = NotificationService.appex; sourceTree = BUILT_PRODUCTS_DIR; };\n${swift} /* NotificationService.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = NotificationService.swift; sourceTree = "<group>"; };\n${plist} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };`);
section('PBXGroup',`${group} /* NotificationService */ = {isa = PBXGroup; children = (${swift}, ${plist}, ); path = NotificationService; sourceTree = "<group>"; };`);
section('PBXSourcesBuildPhase',`${sources} = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (${srcBuild}, ); runOnlyForDeploymentPostprocessing = 0; };`);
section('PBXFrameworksBuildPhase',`${frameworks} = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };`);
section('PBXResourcesBuildPhase',`${resources} = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };`);
section('PBXContainerItemProxy',`${proxy} = {isa = PBXContainerItemProxy; containerPortal = 97C146E61CF9000F007C117D; proxyType = 1; remoteGlobalIDString = ${target}; remoteInfo = NotificationService; };`);
section('PBXTargetDependency',`${dep} = {isa = PBXTargetDependency; target = ${target}; targetProxy = ${proxy}; };`);
section('PBXCopyFilesBuildPhase',`${embed} /* Embed App Extensions */ = {isa = PBXCopyFilesBuildPhase; buildActionMask = 2147483647; dstPath = ""; dstSubfolderSpec = 13; files = (${embedBuild}, ); name = "Embed App Extensions"; runOnlyForDeploymentPostprocessing = 0; };`);
const names = ['Debug','Release','Profile',...['development','staging','production'].flatMap(f=>['Debug','Release','Profile'].map(c=>`${c}-${f}`))];
for (const [i,name] of names.entries()) {
  const bundle = name.endsWith('development')?'world.indigen.mobile.dev':name.endsWith('staging')?'world.indigen.mobile.staging':'world.indigen.mobile';
  const base = name.endsWith('development') ? 'F10000000000000000000001' : name.endsWith('staging') ? 'F10000000000000000000002' : name.endsWith('production') ? 'F10000000000000000000003' : name === 'Debug' ? '9740EEB21CF90195004384FC' : '7AFA3C8E1D35360C0083082E';
  section('XCBuildConfiguration',`${code(100+i)} /* ${name} */ = {isa = XCBuildConfiguration; baseConfigurationReference = ${base}; buildSettings = {APPLICATION_EXTENSION_API_ONLY = YES; CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = "$(FLUTTER_BUILD_NUMBER)"; MARKETING_VERSION = "$(FLUTTER_BUILD_NAME)"; INFOPLIST_FILE = NotificationService/Info.plist; IPHONEOS_DEPLOYMENT_TARGET = 13.0; PRODUCT_BUNDLE_IDENTIFIER = ${bundle}.NotificationService; PRODUCT_NAME = "$(TARGET_NAME)"; SKIP_INSTALL = YES; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = "${name}"; };`);
}
section('XCConfigurationList',`${configs} = {isa = XCConfigurationList; buildConfigurations = (${names.map((_,i)=>code(100+i)).join(', ')}, ); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };`);
section('PBXNativeTarget',`${target} /* NotificationService */ = {isa = PBXNativeTarget; buildConfigurationList = ${configs}; buildPhases = (${sources}, ${frameworks}, ${resources}, ); buildRules = (); dependencies = (); name = NotificationService; productName = NotificationService; productReference = ${product}; productType = "com.apple.product-type.app-extension"; };`);
function appendIn(id,label,text) { const pattern=new RegExp(`(${id}(?: \\/\\* [^*]+ \\*\\/)? = \\{[\\s\\S]*?${label} = \\()`) ; if(!pattern.test(source))throw Error(`Missing ${id} ${label}`);source=source.replace(pattern,`$1\n${text},`); }
appendIn('97C146ED1CF9000F007C117D','buildPhases',embed);
appendIn('97C146ED1CF9000F007C117D','dependencies',dep);
appendIn('97C146E61CF9000F007C117D','targets',target);
appendIn('97C146E51CF9000F007C117D','children',group);
appendIn('97C146EF1CF9000F007C117D','children',product);
writeFileSync(path,source);console.log('Wired NotificationService target, source, embed phase, dependency and all flavor configurations. Validate/sign on macOS before IOS_RICH_MEDIA_ENABLED.');
