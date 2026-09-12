import {it,expect,vi,afterAll} from 'vitest';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.stubGlobal('React',React);
afterAll(()=>vi.unstubAllGlobals());
vi.mock('../src/components/platform/workspace-sections',()=>({useWorkspaceSection:()=> 'hedera',WorkspaceSections:({items}:{items:{id:string;label:string}[]})=>createElement('nav',null,items.map(item=>createElement('a',{key:item.id,href:'#'+item.id},item.label)))}));
import {WorkspaceDevelopers} from '../src/components/platform/workspace-developers';
it('keeps Hedera and existing developer sections visible without agents',()=>{
 const markup=renderToStaticMarkup(createElement(WorkspaceDevelopers));
 expect(markup).toContain('href="#hedera"');expect(markup).toContain('<section id="hedera"><p role="status">Loading public Hedera evidence');
 for(const label of ['API credentials','API examples','Runner setup','Sell an API'])expect(markup).toContain(label);
});
